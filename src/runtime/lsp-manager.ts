import * as path from 'path';
import {
  resolveStartConfig,
  resolveRunConfig,
  RunCommandArgs,
  StartCommandArgs,
} from '../utils/cli.js';
import {
  autoDetectLsp,
  createConfigFromDirectCommand,
  getLspConfig,
  listAvailableLsps,
} from '../config/lsp-config.js';
import logger from '../utils/logger.js';
import {
  createLspSession,
  LspSession,
  LspSessionProfile,
  normalizeWorkspaceFilePath,
  SessionState,
} from './lsp-session.js';

export type ManagerMode = 'start' | 'run' | null;
export type ManagerState = 'idle' | 'ready' | 'degraded';

export interface LspManagerProfileStatus {
  name: string;
  sessionKey: string;
  configured: boolean;
  state: SessionState;
  command: string;
  workspacePath: string;
  isDefault: boolean;
  lastError: string | null;
  pid: number | null;
  extensions: string[];
  preloadFiles: string[];
  diagnosticsStrategy: 'push' | 'pull';
  workspaceLoader: string | null;
  workspaceReady: boolean;
  workspaceLoading: boolean;
  windowLogCount: number;
  ownedDocumentCount: number;
}

export interface LspManagerStatus {
  mode: ManagerMode;
  state: ManagerState;
  workspacePath: string;
  configPath: string | null;
  defaultProfileName: string | null;
  detectedProfileName: string | null;
  issues: string[];
  profiles: LspManagerProfileStatus[];
}

interface LoadedProfiles {
  mode: ManagerMode;
  workspacePath: string;
  configPath: string | null;
  defaultProfileName: string | null;
  detectedProfileName: string | null;
  issues: string[];
  profiles: LspSessionProfile[];
}

type RuntimeSource =
  | {
      mode: 'start';
      cliArgs: StartCommandArgs;
    }
  | {
      mode: 'run';
      cliArgs: RunCommandArgs;
    };

export interface LspManager {
  configureForStart(cliArgs: StartCommandArgs): Promise<void>;
  configureForRun(cliArgs: RunCommandArgs): Promise<void>;
  getStatus(): LspManagerStatus;
  listProfiles(): LspManagerProfileStatus[];
  getProfileStatus(profileName: string): LspManagerProfileStatus | null;
  detect(): Promise<LspManagerStatus>;
  start(profileName?: string): Promise<LspSession>;
  stop(profileName?: string): Promise<void>;
  restart(profileName?: string): Promise<void>;
  shutdown(): Promise<void>;
  getSessionForFile(filePath: string): Promise<LspSession>;
  getSearchSessions(): Promise<LspSession[]>;
  getStartedSessions(profileName?: string): LspSession[];
}

function getNoProfilesMessage(): string {
  return (
    'No LSP profiles are currently configured. ' +
    'Add a language server to language-servers.yaml, or start Symbols in direct mode with `symbols run <command>`.'
  );
}

function makeSessionKey(profile: LspSessionProfile): string {
  return `${profile.name}::${profile.workspacePath}`;
}

export function createLspManager(): LspManager {
  let source: RuntimeSource | null = null;
  let mode: ManagerMode = null;
  let workspacePath = process.cwd();
  let configPath: string | null = null;
  let defaultProfileName: string | null = null;
  let detectedProfileName: string | null = null;
  let issues: string[] = [];
  let profiles = new Map<string, LspSessionProfile>();
  const sessions = new Map<string, LspSession>();
  const documentOwners = new Map<string, string>();

  function applyLogLevel(loglevel: string): void {
    if (process.env.SYMBOLS_LOGLEVEL !== loglevel) {
      process.env.SYMBOLS_LOGLEVEL = loglevel;
      logger.level = loglevel;
    }
  }

  function loadProfilesFromSource(activeSource: RuntimeSource): LoadedProfiles {
    if (activeSource.mode === 'run') {
      const resolved = resolveRunConfig(activeSource.cliArgs);
      const resolvedWorkspacePath = path.resolve(resolved.workspace);
      const resolvedWorkspaceUri = `file://${resolvedWorkspacePath}`;
      const resolvedWorkspaceName = path.basename(resolvedWorkspacePath);
      applyLogLevel(resolved.loglevel);

      try {
        const parsedConfig = createConfigFromDirectCommand(
          activeSource.cliArgs.directCommand.commandName,
          activeSource.cliArgs.directCommand.commandArgs
        );

        return {
          mode: 'run',
          workspacePath: resolvedWorkspacePath,
          configPath: null,
          defaultProfileName: parsedConfig.name,
          detectedProfileName: parsedConfig.name,
          issues: [],
          profiles: [
            {
              name: parsedConfig.name,
              config: parsedConfig,
              workspacePath: resolvedWorkspacePath,
              workspaceUri: resolvedWorkspaceUri,
              workspaceName: resolvedWorkspaceName,
              configPath: null,
            },
          ],
        };
      } catch (error) {
        return {
          mode: 'run',
          workspacePath: resolvedWorkspacePath,
          configPath: null,
          defaultProfileName: null,
          detectedProfileName: null,
          issues: [error instanceof Error ? error.message : String(error)],
          profiles: [],
        };
      }
    }

    const resolved = resolveStartConfig(activeSource.cliArgs);
    const resolvedWorkspacePath = path.resolve(resolved.workspace);
    const resolvedWorkspaceUri = `file://${resolvedWorkspacePath}`;
    const resolvedWorkspaceName = path.basename(resolvedWorkspacePath);
    applyLogLevel(resolved.loglevel);

    const availableProfileNames = listAvailableLsps(
      resolved.configPath,
      resolved.workspace
    );
    const selectedProfileName = resolved.lsp || null;
    const autoDetectedProfileName = selectedProfileName
      ? null
      : autoDetectLsp(resolvedWorkspacePath, resolved.configPath);

    const requestedProfileNames = selectedProfileName
      ? [selectedProfileName]
      : availableProfileNames;

    const loadedProfiles: LspSessionProfile[] = [];
    const loadIssues: string[] = [];

    for (const profileName of requestedProfileNames) {
      const parsedConfig = getLspConfig(
        profileName,
        resolved.configPath,
        resolved.workspace
      );

      if (!parsedConfig) {
        loadIssues.push(
          `LSP configuration not found for profile '${profileName}'.`
        );
        continue;
      }

      loadedProfiles.push({
        name: profileName,
        config: parsedConfig,
        workspacePath: resolvedWorkspacePath,
        workspaceUri: resolvedWorkspaceUri,
        workspaceName: resolvedWorkspaceName,
        configPath: resolved.configPath || null,
      });
    }

    if (loadedProfiles.length === 0) {
      loadIssues.push(getNoProfilesMessage());
    }

    return {
      mode: 'start',
      workspacePath: resolvedWorkspacePath,
      configPath: resolved.configPath || null,
      defaultProfileName:
        selectedProfileName ||
        autoDetectedProfileName ||
        loadedProfiles[0]?.name ||
        null,
      detectedProfileName: autoDetectedProfileName,
      issues: loadIssues,
      profiles: loadedProfiles,
    };
  }

  function getOwnedDocumentCount(sessionKey: string): number {
    let count = 0;
    for (const ownedSessionKey of documentOwners.values()) {
      if (ownedSessionKey === sessionKey) {
        count += 1;
      }
    }
    return count;
  }

  function getProfileSessions(profileName?: string): LspSession[] {
    return [...sessions.values()].filter(
      (session) => !profileName || session.getProfile().name === profileName
    );
  }

  function onSessionDocumentOpen(
    sessionKey: string,
    documentPath: string
  ): void {
    documentOwners.set(documentPath, sessionKey);
  }

  function onSessionDocumentClose(
    sessionKey: string,
    documentPath: string
  ): void {
    if (documentOwners.get(documentPath) === sessionKey) {
      documentOwners.delete(documentPath);
    }
  }

  function getOrCreateSession(profile: LspSessionProfile): LspSession {
    const sessionKey = makeSessionKey(profile);
    const existingSession = sessions.get(sessionKey);
    if (existingSession) {
      existingSession.setProfile(profile);
      return existingSession;
    }

    const session = createLspSession(sessionKey, profile, {
      onDocumentClaimed(activeSessionKey, documentPath) {
        onSessionDocumentOpen(activeSessionKey, documentPath);
      },
      onDocumentReleased(activeSessionKey, documentPath) {
        onSessionDocumentClose(activeSessionKey, documentPath);
      },
    });
    sessions.set(sessionKey, session);
    return session;
  }

  function removeDocumentOwnersForSession(session: LspSession): void {
    for (const documentPath of session.clearOwnedDocuments()) {
      if (documentOwners.get(documentPath) === session.sessionKey) {
        documentOwners.delete(documentPath);
      }
    }
  }

  function syncDocumentOwnersFromSession(session: LspSession): void {
    for (const documentPath of session.listOwnedDocuments()) {
      documentOwners.set(documentPath, session.sessionKey);
    }
  }

  function syncLoadedProfiles(loaded: LoadedProfiles): void {
    mode = loaded.mode;
    workspacePath = loaded.workspacePath;
    configPath = loaded.configPath;
    defaultProfileName = loaded.defaultProfileName;
    detectedProfileName = loaded.detectedProfileName;
    issues = loaded.issues;

    const nextProfiles = new Map<string, LspSessionProfile>();
    for (const profile of loaded.profiles) {
      nextProfiles.set(profile.name, profile);
      getOrCreateSession(profile);
    }

    for (const [sessionKey, session] of sessions) {
      const sessionProfileName = session.getProfile().name;
      if (
        !nextProfiles.has(sessionProfileName) &&
        !session.isActive() &&
        !session.isReady()
      ) {
        removeDocumentOwnersForSession(session);
        sessions.delete(sessionKey);
      }
    }

    profiles = nextProfiles;
  }

  function reloadProfiles(): void {
    if (!source) {
      return;
    }

    syncLoadedProfiles(loadProfilesFromSource(source));
  }

  function ensureProfilesLoaded(profileName?: string): void {
    if (!source) {
      return;
    }

    if (profiles.size === 0 || (profileName && !profiles.has(profileName))) {
      reloadProfiles();
    }
  }

  function resolveDefaultConfiguredProfileName(): string | null {
    if (defaultProfileName && profiles.has(defaultProfileName)) {
      return defaultProfileName;
    }

    const firstConfiguredProfile = profiles.keys().next().value;
    return firstConfiguredProfile ?? null;
  }

  function resolveConfiguredProfile(profileName?: string): LspSessionProfile {
    if (profileName) {
      const explicitProfile = profiles.get(profileName);
      if (!explicitProfile) {
        throw new Error(`Unknown LSP profile '${profileName}'.`);
      }
      return explicitProfile;
    }

    const defaultConfiguredProfileName = resolveDefaultConfiguredProfileName();
    if (!defaultConfiguredProfileName) {
      throw new Error(getNoProfilesMessage());
    }

    const defaultProfile = profiles.get(defaultConfiguredProfileName);
    if (!defaultProfile) {
      throw new Error(getNoProfilesMessage());
    }

    return defaultProfile;
  }

  function resolveOwnedSessionForFile(filePath: string): LspSession | null {
    const normalizedPath = normalizeWorkspaceFilePath(workspacePath, filePath);
    const sessionKey = documentOwners.get(normalizedPath);
    if (!sessionKey) {
      return null;
    }

    const session = sessions.get(sessionKey);
    if (!session) {
      documentOwners.delete(normalizedPath);
      return null;
    }

    return session;
  }

  function resolveProfileForFile(filePath: string): LspSessionProfile | null {
    if (profiles.size === 0) {
      return null;
    }

    const normalizedPath = normalizeWorkspaceFilePath(workspacePath, filePath);
    const extension = path.extname(normalizedPath);
    const matchingProfiles = [...profiles.values()].filter(
      (profile) => extension && profile.config.extensions[extension]
    );

    if (matchingProfiles.length > 0) {
      const defaultConfiguredProfileName =
        resolveDefaultConfiguredProfileName();
      if (defaultConfiguredProfileName) {
        const defaultMatchingProfile = matchingProfiles.find(
          (profile) => profile.name === defaultConfiguredProfileName
        );
        if (defaultMatchingProfile) {
          return defaultMatchingProfile;
        }
      }

      return matchingProfiles[0] || null;
    }

    if (profiles.size === 1) {
      return [...profiles.values()][0] || null;
    }

    const defaultConfiguredProfileName = resolveDefaultConfiguredProfileName();
    if (defaultConfiguredProfileName) {
      return profiles.get(defaultConfiguredProfileName) || null;
    }

    return null;
  }

  async function startSession(session: LspSession): Promise<LspSession> {
    await session.start();
    syncDocumentOwnersFromSession(session);
    return session;
  }

  async function stopSession(session: LspSession): Promise<void> {
    await session.stop();
    removeDocumentOwnersForSession(session);
  }

  async function startProfile(profileName?: string): Promise<LspSession> {
    ensureProfilesLoaded(profileName);
    const profile = resolveConfiguredProfile(profileName);
    return startSession(getOrCreateSession(profile));
  }

  async function routeFile(filePath: string): Promise<LspSession> {
    ensureProfilesLoaded();

    const ownedSession = resolveOwnedSessionForFile(filePath);
    if (ownedSession) {
      return startSession(ownedSession);
    }

    let profile = resolveProfileForFile(filePath);
    if (!profile) {
      reloadProfiles();
      profile = resolveProfileForFile(filePath);
    }

    if (!profile) {
      throw new Error(
        `No configured LSP profile can handle '${filePath}'. Configure an extension mapping or select a profile explicitly.`
      );
    }

    const session = getOrCreateSession(profile);
    return startSession(session);
  }

  function toProfileStatus(
    session: LspSession,
    configured: boolean
  ): LspManagerProfileStatus {
    const snapshot = session.getStatusSnapshot();
    return {
      name: snapshot.profileName,
      sessionKey: snapshot.sessionKey,
      configured,
      state: snapshot.state,
      command: snapshot.command,
      workspacePath: snapshot.workspacePath,
      isDefault: snapshot.profileName === defaultProfileName,
      lastError: snapshot.lastError,
      pid: snapshot.pid,
      extensions: snapshot.extensions,
      preloadFiles: snapshot.preloadFiles,
      diagnosticsStrategy: snapshot.diagnosticsStrategy,
      workspaceLoader: snapshot.workspaceLoader,
      workspaceReady: snapshot.workspaceReady,
      workspaceLoading: snapshot.workspaceLoading,
      windowLogCount: snapshot.windowLogCount,
      ownedDocumentCount: getOwnedDocumentCount(snapshot.sessionKey),
    };
  }

  function configureFromSource(activeSource: RuntimeSource): void {
    source = activeSource;
    reloadProfiles();
  }

  return {
    configureForStart(cliArgs: StartCommandArgs): Promise<void> {
      configureFromSource({ mode: 'start', cliArgs });
      return Promise.resolve();
    },

    configureForRun(cliArgs: RunCommandArgs): Promise<void> {
      configureFromSource({ mode: 'run', cliArgs });
      return Promise.resolve();
    },

    getStatus(): LspManagerStatus {
      const profileStatuses = [...sessions.values()]
        .map((session) =>
          toProfileStatus(session, profiles.has(session.getProfile().name))
        )
        .sort((left, right) => left.name.localeCompare(right.name));

      const hasReadySession = profileStatuses.some(
        (profile) => profile.state === 'ready'
      );
      const hasErrors =
        issues.length > 0 ||
        profileStatuses.some((profile) => profile.state === 'error');

      const state: ManagerState = hasReadySession
        ? 'ready'
        : hasErrors || profileStatuses.length === 0
          ? 'degraded'
          : 'idle';

      return {
        mode,
        state,
        workspacePath,
        configPath,
        defaultProfileName,
        detectedProfileName,
        issues: [...issues],
        profiles: profileStatuses,
      };
    },

    listProfiles(): LspManagerProfileStatus[] {
      return this.getStatus().profiles;
    },

    getProfileStatus(profileName: string): LspManagerProfileStatus | null {
      return (
        this.getStatus().profiles.find(
          (profile) => profile.name === profileName
        ) || null
      );
    },

    detect(): Promise<LspManagerStatus> {
      reloadProfiles();
      return Promise.resolve(this.getStatus());
    },

    start(profileName?: string): Promise<LspSession> {
      return startProfile(profileName);
    },

    async stop(profileName?: string): Promise<void> {
      const targetSessions = profileName
        ? getProfileSessions(profileName)
        : [...sessions.values()];

      if (profileName && targetSessions.length === 0) {
        throw new Error(`Unknown LSP profile '${profileName}'.`);
      }

      for (const session of targetSessions) {
        await stopSession(session);
      }
    },

    async restart(profileName?: string): Promise<void> {
      const targetSessions = profileName
        ? getProfileSessions(profileName)
        : [...sessions.values()].filter(
            (session) => session.isActive() || session.isReady()
          );

      if (profileName && targetSessions.length === 0) {
        throw new Error(`Unknown LSP profile '${profileName}'.`);
      }

      for (const session of targetSessions) {
        await stopSession(session);
      }

      reloadProfiles();

      const targetProfileNames = profileName
        ? [profileName]
        : targetSessions.map((session) => session.getProfile().name);

      if (targetProfileNames.length === 0) {
        const defaultConfiguredProfileName =
          resolveDefaultConfiguredProfileName();
        if (defaultConfiguredProfileName) {
          targetProfileNames.push(defaultConfiguredProfileName);
        }
      }

      for (const targetProfileName of targetProfileNames) {
        if (!profiles.has(targetProfileName)) {
          continue;
        }
        await startProfile(targetProfileName);
      }
    },

    async shutdown(): Promise<void> {
      for (const session of [...sessions.values()]) {
        await stopSession(session);
      }
    },

    getSessionForFile(filePath: string): Promise<LspSession> {
      return routeFile(filePath);
    },

    async getSearchSessions(): Promise<LspSession[]> {
      ensureProfilesLoaded();

      const targetSessions =
        profiles.size > 0
          ? [...profiles.values()].map((profile) => getOrCreateSession(profile))
          : [...sessions.values()];

      if (targetSessions.length === 0) {
        throw new Error(getNoProfilesMessage());
      }

      const startedSessions: LspSession[] = [];
      const errors: string[] = [];

      for (const session of targetSessions) {
        try {
          startedSessions.push(await startSession(session));
        } catch (error) {
          errors.push(
            `${session.getProfile().name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (startedSessions.length === 0) {
        throw new Error(errors.join('\n'));
      }

      if (errors.length > 0) {
        logger.warn(
          'Some LSP profiles failed to start during workspace search',
          {
            errors,
          }
        );
      }

      return startedSessions;
    },

    getStartedSessions(profileName?: string): LspSession[] {
      return getProfileSessions(profileName).filter((session) =>
        session.isReady()
      );
    },
  };
}
