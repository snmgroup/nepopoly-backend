/**
 * Creates a random delay within a configured range to simulate bot thinking time.
 * It reads `BOT_MIN_DELAY_MS` and `BOT_MAX_DELAY_MS` from the environment,
 * with defaults of 500ms and 1500ms respectively.
 * The delay is skipped if `isSimulation` is true.
 * @param isSimulation If true, the delay will be skipped.
 */
export const botDelay = async (  isSimulation?: boolean,max?:number,): Promise<void> => {
  if (isSimulation) {
    return;
  }

  const minDelay = parseInt(process.env.BOT_MIN_DELAY_MS || '500', 10);
  const maxDelay = max || parseInt(process.env.BOT_MAX_DELAY_MS || '1500', 10);

  if (isNaN(minDelay) || isNaN(maxDelay) || minDelay < 0 || maxDelay < minDelay) {
    console.error('Invalid bot delay configuration. Using default values.');
    const defaultMin = 500;
    const defaultMax = 1500;
    const randomTime = Math.floor(Math.random() * (defaultMax - defaultMin + 1)) + defaultMin;
    return new Promise(resolve => setTimeout(resolve, randomTime));
  }

  const randomTime = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  await new Promise(resolve => setTimeout(resolve, randomTime));
};

export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}