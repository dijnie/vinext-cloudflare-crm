import handler from "vinext/server/fetch-handler";
import {
  createCompositionRoot,
  type RuntimeEnv,
} from "../src/lib/composition-root";
import { runScheduled } from "./scheduled-runner";

const worker: ExportedHandler<RuntimeEnv> = {
  fetch: handler.fetch,
  scheduled(_controller, env, context) {
    const root = createCompositionRoot(env),
      transport = {
        send: async ({
          url,
          headers,
          body,
        }: {
          url: string;
          headers: Headers;
          body: string;
        }) => {
          const response = await fetch(url, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(10_000),
          });
          return { status: response.status };
        },
      };
    context.waitUntil(runScheduled(root, transport));
  },
};
export default worker;
