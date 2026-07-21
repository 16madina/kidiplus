/**
 * Shared LiveKit Web Egress encoding for YouTube / Facebook RTMP.
 * Shorter keyframe interval than the streaming default (4s) helps platforms
 * trim their playback buffer a bit — won't remove FB/YT CDN delay entirely.
 */

import { EncodingOptions, VideoCodec } from "livekit-server-sdk";

/** Portrait 720p @ 30fps, same shape as PORTRAIT_H264_720P_30, keyframes every 2s. */
export function socialRestreamEncodingOptions(): EncodingOptions {
  return new EncodingOptions({
    width: 720,
    height: 1280,
    depth: 24,
    framerate: 30,
    videoCodec: VideoCodec.H264_MAIN,
    videoBitrate: 3000,
    audioBitrate: 128,
    audioFrequency: 44100,
    keyFrameInterval: 2,
  });
}
