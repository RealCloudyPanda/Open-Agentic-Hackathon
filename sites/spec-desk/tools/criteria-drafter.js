// Spike: writes a fixed acceptance_criteria list.
export class CriteriaDrafter {
  invoke(args, sly) {
    sly.acceptance_criteria = [{ id: "AC-1", title: "Undo reverts my last edit" }];
    return { criteria: sly.acceptance_criteria };
  }
}
