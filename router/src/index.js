// SPEC RS95: the replore-router Worker. It only hosts the RouterDO Durable Object (a Pages project cannot define one); the
// Pages Function reaches it through the ROUTER binding (script_name = "replore-router"). Nothing here is public: the
// Worker's own fetch answers 404, and the DO never calls a provider or sees a key.
import { DurableObject } from "cloudflare:workers";
import { RouterService } from "./service.js";

export class RouterDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.svc = new RouterService(ctx.storage);
    ctx.blockConcurrencyWhile(() => this.svc.init());   // init only (Rules of Durable Objects); never around a call
  }
  // RPC methods, one session each (one billed request)
  acquire(req) { return this.svc.acquire(req); }
  report(list) { return this.svc.report(list); }
  status() { return this.svc.status(); }
  alarm() { return this.svc.alarm(); }
}

export default { fetch() { return new Response("not found", { status: 404 }); } };
