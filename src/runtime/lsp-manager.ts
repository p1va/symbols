import * as fs from 'node:fs';
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
  loadLspConfig,
} from '../config/lsp-config.js';
import logger from '../utils/logger.js';
import {
  createLspSession,
  LspSession,
  LspSessionProfile,
  normalizeWorkspaceFilePath,
  SessionState,
} from './lsp-session.js';

type ManagerMode = 'start' | 'run' | null;
type ManagerState = 'idle' | 'ready' | 'uninitialized' | 'degraded';

export interface LspManagerProfileStatus {
  name: string;
  sessionKey: string;
  configured: boolean;
  state: SessionState;
  command: string;
  commandName: string;
  commandArgs: string[];
  workspacePath: string;
  workspaceFiles: string[];
  isDefault: boolean;
  lastError: string | null;
  pid: number | null;
  extensions: string[];
  preloadFiles: string[];
  diagnosticsStrategy: 'push' | 'pull';
  workspaceLoader: string | null;
  workspaceReady: boolean | null;
  workspaceLoading: boolean | null;
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
  configureForStart(this: void, cliArgs: StartCommandArgs): Promise<void>;
  configureForRun(this: void, cliArgs: RunCommandArgs): Promise<void>;
  getStatus(this: void): LspManagerStatus;
  listProfiles(this: void): LspManagerProfileStatus[];
  getProfileStatus(
    this: void,
    profileName: string
  ): LspManagerProfileStatus | null;
  reload(this: void): Promise<LspManagerStatus>;
  detect(this: void): Promise<LspManagerStatus>;
  start(this: void, profileName?: string): Promise<LspSession>;
  stop(this: void, profileName?: string): Promise<void>;
  restart(this: void, profileName?: string): Promise<void>;
  shutdown(this: void): Promise<void>;
  getSessionForFile(this: void, filePath: string): Promise<LspSession>;
  getSearchSessions(this: void): Promise<LspSession[]>;
  getStartedSessions(this: void, profileName?: string): LspSession[];
}

function getNoProfilesMessage(): string {
  return (
    'No LSP profiles are currently configured. ' +
    'Add a language server to language-servers.yaml, or start Symbols in direct mode with `symbols run <command>`.'
  );
}

function getNoConfigMessage(): string {
  return (
    'No configuration file was found. ' +
    'Run `symbols config init` to create language-servers.yaml, then add a language server profile, or start Symbols in direct mode with `symbols run <command>`.'
  );
}

function isInitializationIssue(issue: string): boolean {
  return issue === getNoProfilesMessage() || issue === getNoConfigMessage();
}

function makeSessionKey(profile: LspSessionProfile): string {
  return `${profile.name}::${profile.workspacePath}`;
}

function getUnsupportedFileMessage(filePath: string): string {
  const extension = path.extname(filePath);
  const extensionMessage = extension
    ? `extension '${extension}'`
    : 'files without an extension';

  return (
    `No configured LSP profile handles ${extensionMessage} for '${filePath}'. ` +
    'Add an explicit extension mapping for this file type or choose a supported file.'
  );
}

function matchesWorkspaceFilePattern(
  workspaceFile: string,
  pattern: string
): boolean {
  if (!pattern.includes('*')) {
    return workspaceFile === pattern;
  }

  const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
  return regex.test(workspaceFile);
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

    const configWithSource = loadLspConfig(
      resolved.configPath,
      resolved.workspace
    );
    const availableProfileNames = Object.keys(
      configWithSource.config['language-servers']
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
      loadIssues.push(
        configWithSource.source.type === 'default'
          ? getNoConfigMessage()
          : getNoProfilesMessage()
      );
    }

    return {
      mode: 'start',
      workspacePath: resolvedWorkspacePath,
      configPath:
        configWithSource.source.type === 'default'
          ? null
          : configWithSource.source.path,
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

  function getRunningSessions(profileName?: string): LspSession[] {
    return getProfileSessions(profileName).filter(
      (session) => session.isActive() || session.isReady()
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
      // Running sessions keep the config snapshot they were launched with.
      if (!existingSession.isActive() && !existingSession.isReady()) {
        existingSession.setProfile(profile);
      }
      return existingSession;
    }

    const session = createLspSession(sessionKey, profile, {
      onDocumentClaimed(activeSessionKey, documentPath) {
        onSessionDocumentOpen(activeSessionKey, documentPath);
      },
      onDocumentReleased(activeSessionKey, documentPath) {
        onSessionDocumentClose(activeSessionKey, documentPath);
      },
      onSessionUnexpectedExit(activeSessionKey) {
        if (activeSessionKey === sessionKey) {
          const crashedSession = sessions.get(sessionKey);
          if (crashedSession) {
            removeDocumentOwnersForSession(crashedSession);
          }
        }
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

  async function reloadRunningProfiles(): Promise<LspManagerStatus> {
    const runningProfileNames = [
      ...new Set(
        getRunningSessions().map((session) => session.getProfile().name)
      ),
    ];

    for (const session of getRunningSessions()) {
      await stopSession(session);
    }

    reloadProfiles();

    for (const profileName of runningProfileNames) {
      if (!profiles.has(profileName)) {
        continue;
      }
      await startProfile(profileName);
    }

    return getCurrentStatus();
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
      throw new Error(issues[0] || getNoProfilesMessage());
    }

    const defaultProfile = profiles.get(defaultConfiguredProfileName);
    if (!defaultProfile) {
      throw new Error(issues[0] || getNoProfilesMessage());
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

    return null;
  }

  function profileMatchesWorkspaceMarkers(profile: LspSessionProfile): boolean {
    if (profile.config.workspace_files.length === 0) {
      return false;
    }

    try {
      const workspaceEntries = fs.readdirSync(profile.workspacePath);
      return profile.config.workspace_files.some((pattern) =>
        workspaceEntries.some((entry) =>
          matchesWorkspaceFilePattern(entry, pattern)
        )
      );
    } catch {
      return false;
    }
  }

  function resolveSearchTargetSessions(): LspSession[] {
    if (profiles.size === 0) {
      return [...sessions.values()];
    }

    if (mode === 'run') {
      return [...profiles.values()].map((profile) => getOrCreateSession(profile));
    }

    const relevantProfiles = [...profiles.values()].filter((profile) => {
      return profileMatchesWorkspaceMarkers(profile);
    });

    return relevantProfiles.map((profile) => getOrCreateSession(profile));
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

    if (profiles.size === 0) {
      throw new Error(issues[0] || getNoProfilesMessage());
    }

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
      throw new Error(getUnsupportedFileMessage(filePath));
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
      commandName: session.getProfile().config.commandName,
      commandArgs: [...session.getProfile().config.commandArgs],
      workspacePath: snapshot.workspacePath,
      workspaceFiles: [...session.getProfile().config.workspace_files],
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

  function getCurrentStatus(): LspManagerStatus {
    const profileStatuses = [...sessions.values()]
      .map((session) =>
        toProfileStatus(session, profiles.has(session.getProfile().name))
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    const hasReadySession = profileStatuses.some(
      (profile) => profile.state === 'ready'
    );
    const hasSessionErrors = profileStatuses.some(
      (profile) => profile.state === 'error'
    );
    const hasNonInitializationIssues = issues.some(
      (issue) => !isInitializationIssue(issue)
    );
    const isUninitialized =
      profileStatuses.length === 0 &&
      issues.length > 0 &&
      issues.every((issue) => isInitializationIssue(issue));

    const hasErrors = hasNonInitializationIssues || hasSessionErrors;

    const state: ManagerState = hasReadySession
      ? 'ready'
      : isUninitialized
        ? 'uninitialized'
        : hasErrors || (profileStatuses.length === 0 && hasSessionErrors)
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
      return getCurrentStatus();
    },

    listProfiles(): LspManagerProfileStatus[] {
      return getCurrentStatus().profiles;
    },

    getProfileStatus(profileName: string): LspManagerProfileStatus | null {
      return (
        getCurrentStatus().profiles.find(
          (profile) => profile.name === profileName
        ) || null
      );
    },

    reload(): Promise<LspManagerStatus> {
      return reloadRunningProfiles();
    },

    detect(): Promise<LspManagerStatus> {
      reloadProfiles();
      return Promise.resolve(getCurrentStatus());
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

      const targetSessions = resolveSearchTargetSessions();

      if (targetSessions.length === 0) {
        throw new Error(issues[0] || getNoProfilesMessage());
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
