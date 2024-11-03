/**
 * Expected errors our code throws to short-circuit the CLI.
 * Give special display treatment.
 * The message is shown, but the stack trace isn't.
 */
export class BunkerError extends Error {}
