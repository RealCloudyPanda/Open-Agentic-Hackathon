// Spike: reports the sly_data keys it received.
export class PlanBuilder {
  invoke(args, sly) {
    return { received_fields: Object.keys(sly || {}).sort() };
  }
}
