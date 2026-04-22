import { StackDepthBucket } from "./types";

export const STACK_DEPTH_BUCKETS: StackDepthBucket[] = [
  "10–15bb",
  "15–20bb",
  "20–30bb",
  "30–40bb",
  "40–50bb",
  "50–60bb",
  "60–80bb",
  "80–100bb",
  "100bb+",
];

export function getStackDepthBucket(stackInBlinds: number): StackDepthBucket {
  if (stackInBlinds < 15) return "10–15bb";
  if (stackInBlinds < 20) return "15–20bb";
  if (stackInBlinds < 30) return "20–30bb";
  if (stackInBlinds < 40) return "30–40bb";
  if (stackInBlinds < 50) return "40–50bb";
  if (stackInBlinds < 60) return "50–60bb";
  if (stackInBlinds < 80) return "60–80bb";
  if (stackInBlinds < 100) return "80–100bb";
  return "100bb+";
}
