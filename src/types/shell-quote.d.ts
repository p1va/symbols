declare module 'shell-quote' {
  export type ShellQuoteToken =
    | string
    | number
    | boolean
    | null
    | { op: string; pattern?: string };

  export function parse(input: string): ShellQuoteToken[];
}
