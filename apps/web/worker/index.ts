import { DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES, handleImageOptimization } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  BOT_TESTNET_RPC_URL?: string;
  VERIFIER_PRIVATE_KEY?: string;
  EVIDENCE_SIGNER_PRIVATE_KEY?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env = {} as Env, ctx: ExecutionContext): Promise<Response> {
    if (env.BOT_TESTNET_RPC_URL) process.env.BOT_TESTNET_RPC_URL = env.BOT_TESTNET_RPC_URL;
    if (env.VERIFIER_PRIVATE_KEY) process.env.VERIFIER_PRIVATE_KEY = env.VERIFIER_PRIVATE_KEY;
    if (env.EVIDENCE_SIGNER_PRIVATE_KEY) process.env.EVIDENCE_SIGNER_PRIVATE_KEY = env.EVIDENCE_SIGNER_PRIVATE_KEY;
    const url = new URL(request.url);
    if (url.pathname === "/_vinext/image") {
      const widths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, widths);
    }
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
