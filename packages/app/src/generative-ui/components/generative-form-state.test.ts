import { describe, expect, it } from "vitest";
import { createGenerativeFormState, generativeFormReducer } from "./generative-form-state";

describe("generativeFormReducer", () => {
  it("only enters submitted after a successful send", () => {
    const initial = createGenerativeFormState({ name: "Ada" });
    const submitting = generativeFormReducer(initial, { type: "submit_started" });
    const submitted = generativeFormReducer(submitting, { type: "submit_resolved", sent: true });
    expect(submitting.status).toBe("submitting");
    expect(submitted.status).toBe("submitted");
  });

  it("returns to an editable error state when sending returns false", () => {
    const initial = createGenerativeFormState({ name: "Ada" });
    const submitting = generativeFormReducer(initial, { type: "submit_started" });
    const failed = generativeFormReducer(submitting, { type: "submit_resolved", sent: false });
    expect(failed).toEqual({ status: "error", values: { name: "Ada" }, error: "提交失败，请重试" });
  });

  it("prevents duplicate submit transitions and clears error when editing", () => {
    const initial = createGenerativeFormState({ name: "Ada" });
    const submitting = generativeFormReducer(initial, { type: "submit_started" });
    expect(generativeFormReducer(submitting, { type: "submit_started" })).toBe(submitting);
    const failed = generativeFormReducer(submitting, { type: "submit_resolved", sent: false });
    const edited = generativeFormReducer(failed, {
      type: "field_changed",
      field: "name",
      value: "Grace",
    });
    expect(edited).toEqual({ status: "editable", values: { name: "Grace" }, error: null });
  });
});
