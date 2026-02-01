/**
 * Lane System - Serializes concurrent requests
 *
 * Inspired by OpenClaw's /agents/pi-embedded-runner/lanes.ts
 *
 * Key concepts:
 * - Each session has its own lane to serialize requests
 * - Global lane for cross-session serialization (optional)
 * - Prevents race conditions in session state
 *
 * This ensures that:
 * - Multiple requests to the same session are processed sequentially
 * - Session state (message history) is never corrupted by concurrent writes
 */

type Task<T> = () => Promise<T>;

interface LaneState {
  queue: Array<{
    task: Task<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }>;
  running: boolean;
}

const lanes = new Map<string, LaneState>();

/**
 * Get or create a lane for the given key
 */
function getLane(laneKey: string): LaneState {
  let lane = lanes.get(laneKey);
  if (!lane) {
    lane = { queue: [], running: false };
    lanes.set(laneKey, lane);
  }
  return lane;
}

/**
 * Process tasks in a lane sequentially
 */
async function processLane(laneKey: string): Promise<void> {
  const lane = getLane(laneKey);

  if (lane.running) {
    return; // Already processing
  }

  lane.running = true;

  while (lane.queue.length > 0) {
    const item = lane.queue.shift()!;

    try {
      const result = await item.task();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    }
  }

  lane.running = false;

  // Clean up empty lanes
  if (lane.queue.length === 0) {
    lanes.delete(laneKey);
  }
}

/**
 * Enqueue a task in a lane
 *
 * Tasks in the same lane are executed sequentially.
 * Tasks in different lanes can run concurrently.
 *
 * @param laneKey - Unique identifier for the lane (e.g., session ID)
 * @param task - Async function to execute
 * @returns Promise that resolves when the task completes
 */
export async function enqueueInLane<T>(
  laneKey: string,
  task: Task<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const lane = getLane(laneKey);

    lane.queue.push({
      task: task as Task<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    // Start processing if not already running
    void processLane(laneKey);
  });
}

/**
 * Get the session lane key for a session
 */
export function getSessionLaneKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Get the global lane key
 */
export function getGlobalLaneKey(): string {
  return "global";
}

/**
 * Enqueue a task in the session lane
 *
 * This ensures all operations for a session are serialized.
 */
export async function enqueueInSessionLane<T>(
  sessionId: string,
  task: Task<T>
): Promise<T> {
  return enqueueInLane(getSessionLaneKey(sessionId), task);
}

/**
 * Get current lane statistics (for debugging)
 */
export function getLaneStats(): {
  activeLanes: number;
  totalQueuedTasks: number;
} {
  let totalQueuedTasks = 0;

  for (const lane of lanes.values()) {
    totalQueuedTasks += lane.queue.length;
  }

  return {
    activeLanes: lanes.size,
    totalQueuedTasks,
  };
}
