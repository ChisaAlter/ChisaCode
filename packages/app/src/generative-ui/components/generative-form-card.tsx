import React, { useMemo, useCallback, useEffect, useReducer, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import type { GenerativeUiComponentBaseProps } from "@/generative-ui/registry/types";
import {
  createGenerativeFormState,
  createGenerativeFormSubmissionController,
  dispatchGenerativeFormChange,
  generativeFormReducer,
  isGenerativeFormEditable,
} from "@/generative-ui/components/generative-form-state";

interface FormField {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "textarea" | "date";
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
}

interface FormProps extends GenerativeUiComponentBaseProps {
  props: {
    title?: string;
    fields: FormField[];
    submitLabel?: string;
  };
}

const accessibilityDisabledState = { disabled: true } as const;
const accessibilityEnabledState = { disabled: false } as const;
const selectRowStyle = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  gap: 4,
  marginTop: 4,
} as const;

const optionButtonBaseStyle = {
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 6,
  borderWidth: 1,
} as const;

const optionButtonSelectedStyle = {
  ...optionButtonBaseStyle,
  borderColor: "#3b82f6",
  backgroundColor: "#eff6ff",
} as const;

const optionButtonUnselectedStyle = {
  ...optionButtonBaseStyle,
  borderColor: "#d1d5db",
  backgroundColor: "#fff",
} as const;

const optionTextSelectedStyle = {
  fontSize: 12,
  color: "#3b82f6",
} as const;

const optionTextUnselectedStyle = {
  fontSize: 12,
  color: "#374151",
} as const;

const containerStyle = { padding: 12 } as const;

const titleStyle = {
  fontSize: 14,
  fontWeight: "600" as const,
  marginBottom: 12,
} as const;

const fieldWrapperStyle = { marginBottom: 12 } as const;

const requiredStarStyle = { color: "#ef4444" } as const;

const labelStyle = {
  fontSize: 12,
  fontWeight: "500" as const,
  color: "#374151",
  marginBottom: 4,
} as const;

const inputStyle = {
  borderWidth: 1,
  borderColor: "#d1d5db",
  borderRadius: 6,
  padding: 8,
  fontSize: 13,
  color: "#111",
  backgroundColor: "#fff",
} as const;

const submitButtonBaseStyle = {
  marginTop: 8,
  padding: 10,
  borderRadius: 8,
  alignItems: "center" as const,
} as const;

const submitButtonActiveStyle = {
  ...submitButtonBaseStyle,
  backgroundColor: "#3b82f6",
} as const;

const submitButtonDisabledStyle = {
  ...submitButtonBaseStyle,
  backgroundColor: "#9ca3af",
} as const;

const submitTextStyle = {
  color: "#fff",
  fontSize: 14,
  fontWeight: "600" as const,
} as const;

function FormFieldRenderer({
  field,
  value,
  disabled,
  onChange,
  onSelectOption,
}: {
  field: FormField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSelectOption: (optValue: string) => void;
}) {
  const optionHandlers = useMemo(
    () =>
      (field.options ?? []).map(
        (opt) =>
          function handleOptionPress() {
            onSelectOption(opt.value);
          },
      ),
    [field.options, onSelectOption],
  );

  if (field.type === "select" && field.options) {
    return (
      <View style={selectRowStyle}>
        {field.options.map((opt, i) => (
          <TouchableOpacity
            key={opt.value}
            onPress={optionHandlers[i]}
            disabled={disabled}
            accessibilityState={disabled ? accessibilityDisabledState : accessibilityEnabledState}
            style={value === opt.value ? optionButtonSelectedStyle : optionButtonUnselectedStyle}
          >
            <Text style={value === opt.value ? optionTextSelectedStyle : optionTextUnselectedStyle}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (field.type === "textarea") {
    return (
      <TextInput
        style={inputStyle}
        multiline
        numberOfLines={3}
        value={value}
        onChangeText={onChange}
        placeholder={field.placeholder}
        editable={!disabled}
      />
    );
  }

  const keyboardType = field.type === "number" ? "numeric" : "default";

  return (
    <TextInput
      style={inputStyle}
      value={value}
      onChangeText={onChange}
      placeholder={field.placeholder}
      keyboardType={keyboardType}
      editable={!disabled}
    />
  );
}

export default function GenerativeFormCard({ instanceId, props, sendAction }: FormProps) {
  const fields = props.fields ?? [];

  const [state, dispatch] = useReducer(generativeFormReducer, fields, (initialFields) => {
    const initial: Record<string, string> = {};
    for (const field of initialFields) initial[field.name] = "";
    return createGenerativeFormState(initial);
  });
  const submissionControllerRef = useRef(createGenerativeFormSubmissionController());
  useEffect(() => {
    const controller = submissionControllerRef.current;
    controller.mount();
    return () => controller.unmount();
  }, []);

  const handleChange = useCallback(
    (name: string, value: string) => {
      dispatchGenerativeFormChange(state, submissionControllerRef.current, () => {
        dispatch({ type: "field_changed", field: name, value });
        void sendAction(instanceId, "change", { field: name, value });
      });
    },
    [instanceId, sendAction, state],
  );

  const handleSubmit = useCallback(async () => {
    if (!submissionControllerRef.current.begin()) return;
    dispatch({ type: "submit_started" });
    let sent = false;
    try {
      sent = await sendAction(instanceId, "submit", { values: state.values });
    } catch {
      sent = false;
    }
    if (submissionControllerRef.current.complete(sent)) {
      dispatch({ type: "submit_resolved", sent });
    }
  }, [instanceId, sendAction, state.values]);

  const disabled = !isGenerativeFormEditable(state);
  const submitButtonStyle = useMemo(
    () => (disabled ? submitButtonDisabledStyle : submitButtonActiveStyle),
    [disabled],
  );

  const changeHandlers = useMemo(
    () =>
      fields.map(
        (field) =>
          function createChangeHandler(v: string) {
            handleChange(field.name, v);
          },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields, handleChange],
  );

  const selectOptionHandlers = useMemo(
    () =>
      fields.map(
        (field) =>
          function createSelectHandler(optValue: string) {
            handleChange(field.name, optValue);
          },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields, handleChange],
  );

  return (
    <View style={containerStyle}>
      {props.title ? <Text style={titleStyle}>{props.title}</Text> : null}

      <ScrollView>
        {fields.map((field, fieldIdx) => (
          <View key={field.name} style={fieldWrapperStyle}>
            <Text style={labelStyle}>
              {field.label}
              {field.required ? <Text style={requiredStarStyle}> *</Text> : null}
            </Text>
            <FormFieldRenderer
              field={field}
              value={state.values[field.name] ?? ""}
              disabled={disabled}
              onChange={changeHandlers[fieldIdx]}
              onSelectOption={selectOptionHandlers[fieldIdx]}
            />
          </View>
        ))}
      </ScrollView>

      {state.error ? <Text style={errorTextStyle}>{state.error}</Text> : null}
      <TouchableOpacity onPress={handleSubmit} disabled={disabled} style={submitButtonStyle}>
        <Text style={submitTextStyle}>
          {state.status === "submitted" ? "已提交" : (props.submitLabel ?? "提交")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const errorTextStyle = {
  color: "#dc2626",
  fontSize: 12,
  marginTop: 4,
} as const;
