const BASELINE_GATE = "review-ai-quality";
const FINAL_GATE = "review-final-merge-gate";
const BASELINE_RESULT_STATUSES = new Set(["pass", "pass_with_comments", "fail", "insufficient_evidence", "missing"]);

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactKeys(value, expected) {
  return JSON.stringify(Object.keys(value ?? {}).sort()) === JSON.stringify([...expected].sort());
}

export function inspectReviewPolicyRegistry(registry) {
  const issues = [];
  if (registry?.registry_version !== 2) issues.push("registry_version:expected_2");
  const baseline = registry?.baseline_gate;
  if (!exactKeys(baseline, ["gate", "required_when", "result_cardinality", "missing_target_status", "signal_independent"])) issues.push("baseline_gate:invalid_shape");
  if (baseline?.gate !== BASELINE_GATE) issues.push(`baseline_gate:expected_${BASELINE_GATE}`);
  if (baseline?.required_when !== "evaluative_review_requested" || baseline?.result_cardinality !== "exactly_one" || baseline?.missing_target_status !== "insufficient_evidence" || baseline?.signal_independent !== true) issues.push("baseline_gate:invalid_semantics");
  const finalGate = registry?.final_gate;
  if (!exactKeys(finalGate, ["gate", "required_when", "must_run_last"])) issues.push("final_gate:invalid_shape");
  if (finalGate?.gate !== FINAL_GATE || finalGate?.required_when !== "final_decision_requested" || finalGate?.must_run_last !== true) issues.push("final_gate:invalid_semantics");
  const selected = registry?.signal_selected_gates;
  const heavy = registry?.heavy_gates;
  const mappings = registry?.signal_to_gates;
  if (!Array.isArray(selected) || selected.length === 0 || new Set(selected).size !== selected.length) issues.push("signal_selected_gates:invalid");
  if (!Array.isArray(heavy) || heavy.length === 0 || new Set(heavy).size !== heavy.length) issues.push("heavy_gates:invalid");
  if (selected?.includes(BASELINE_GATE) || heavy?.includes(BASELINE_GATE)) issues.push("baseline_gate:must_not_be_signal_selected_or_heavy");
  if (selected?.includes(FINAL_GATE) || heavy?.includes(FINAL_GATE)) issues.push("final_gate:must_not_be_signal_selected_or_heavy");
  for (const gate of heavy ?? []) if (!selected?.includes(gate)) issues.push(`heavy_gate:not_signal_selected:${gate}`);
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) issues.push("signal_to_gates:invalid");
  for (const [signal, gates] of Object.entries(mappings ?? {})) {
    if (!signal || !Array.isArray(gates) || gates.length === 0 || new Set(gates).size !== gates.length || gates.some((gate) => !selected?.includes(gate))) issues.push(`signal_to_gates:invalid_mapping:${signal || "empty"}`);
  }
  for (const gate of selected ?? []) {
    if (!Object.values(mappings ?? {}).some((gates) => Array.isArray(gates) && gates.includes(gate))) issues.push(`signal_selected_gate:missing_mapping:${gate}`);
  }
  const findings = registry?.finding_contract;
  const expectedFindingKeys = ["required_fields", "optional_fields", "severity_order", "impact_order", "omit_empty_category_sections"];
  if (!exactKeys(findings, expectedFindingKeys)) issues.push("finding_contract:invalid_shape");
  const expectedFields = ["finding_id", "severity", "merge_blocker", "practical_impact", "trigger_or_failure_trace", "evidence_location", "required_post_fix_condition"];
  if (JSON.stringify(findings?.required_fields) !== JSON.stringify(expectedFields)) issues.push("finding_contract:required_fields_drift");
  if (JSON.stringify(findings?.optional_fields) !== JSON.stringify(["category"])) issues.push("finding_contract:optional_fields_drift");
  if (JSON.stringify(findings?.severity_order) !== JSON.stringify(["blocker", "major", "minor", "nit"])) issues.push("finding_contract:severity_order_drift");
  if (JSON.stringify(findings?.impact_order) !== JSON.stringify(["merge_blocker_true_first", "severity_order", "finding_id_code_unit"])) issues.push("finding_contract:impact_order_drift");
  if (findings?.omit_empty_category_sections !== true) issues.push("finding_contract:empty_categories_must_be_omitted");
  return issues;
}

function requiredAdditionalGates(registry, signals) {
  const selected = new Set();
  for (const signal of signals) for (const gate of registry.signal_to_gates?.[signal] ?? []) selected.add(gate);
  return (registry.signal_selected_gates ?? []).filter((gate) => selected.has(gate));
}

function findingIssues(registry, findings) {
  const issues = [];
  const contract = registry.finding_contract;
  const allowedFields = new Set([...(contract?.required_fields ?? []), ...(contract?.optional_fields ?? [])]);
  const seen = new Set();
  for (const finding of findings) {
    const id = typeof finding?.finding_id === "string" && finding.finding_id ? finding.finding_id : "unknown";
    for (const field of contract?.required_fields ?? []) {
      if (!Object.hasOwn(finding ?? {}, field) || finding[field] === "" || finding[field] === null) issues.push(`finding:${id}:missing_${field}`);
    }
    for (const field of Object.keys(finding ?? {})) if (!allowedFields.has(field)) issues.push(`finding:${id}:unknown_${field}`);
    if (seen.has(id)) issues.push(`finding:${id}:duplicate_id`);
    seen.add(id);
    if (!contract?.severity_order?.includes(finding?.severity)) issues.push(`finding:${id}:invalid_severity`);
    if (typeof finding?.merge_blocker !== "boolean") issues.push(`finding:${id}:invalid_merge_blocker`);
    if (finding?.severity === "blocker" && finding?.merge_blocker === false) issues.push(`finding:${id}:blocker_requires_merge_blocker`);
  }
  const severityIndex = new Map((contract?.severity_order ?? []).map((severity, index) => [severity, index]));
  const expected = [...findings].sort((left, right) => {
    if (left.merge_blocker !== right.merge_blocker) return left.merge_blocker ? -1 : 1;
    const severity = (severityIndex.get(left.severity) ?? Number.MAX_SAFE_INTEGER) - (severityIndex.get(right.severity) ?? Number.MAX_SAFE_INTEGER);
    if (severity !== 0) return severity;
    return codeUnitCompare(left.finding_id ?? "", right.finding_id ?? "");
  });
  if (JSON.stringify(expected.map((finding) => finding.finding_id)) !== JSON.stringify(findings.map((finding) => finding.finding_id))) issues.push("findings:impact_order_invalid");
  return issues;
}

function ordinaryOutputIssues(scenario) {
  const issues = [];
  const sections = scenario.ordinary_output_sections ?? [];
  const required = ["Baseline review", "Additional required gates", "Missing evidence", "Findings"];
  for (const section of required) if (!sections.includes(section)) issues.push(`ordinary_output:missing_section:${section}`);
  for (const forbidden of ["Skipped heavy gates", "Diagnostic applicability", "Design findings", "Logic findings", "Test adequacy findings", "Style / maintainability findings", "Scope findings"]) {
    if (sections.includes(forbidden)) issues.push(`ordinary_output:forbidden_section:${forbidden}`);
  }
  if (scenario.final_decision_requested && !sections.includes("Decision")) issues.push("ordinary_output:missing_section:Decision");
  if (!scenario.final_decision_requested && sections.includes("Decision")) issues.push("ordinary_output:unexpected_section:Decision");
  return issues;
}

export function inspectReviewRouteCase(registry, scenario) {
  const issues = [];
  const signals = scenario.observed_signals ?? [];
  if (new Set(signals).size !== signals.length) issues.push("observed_signals:duplicate");
  for (const signal of signals) if (!Object.hasOwn(registry.signal_to_gates ?? {}, signal)) issues.push(`observed_signal:unknown:${signal}`);
  const additional = requiredAdditionalGates(registry, signals);
  const requiredGates = [BASELINE_GATE, ...additional, ...(scenario.final_decision_requested ? [FINAL_GATE] : [])];
  const executed = scenario.executed_gates ?? [];
  const baselineExecutionCount = executed.filter((gate) => gate === BASELINE_GATE).length;
  const baselineResultCount = scenario.baseline_result_count;
  const baselineStatus = scenario.baseline_result_status;
  if (!BASELINE_RESULT_STATUSES.has(baselineStatus)) issues.push("baseline_status:invalid");
  if (!Number.isInteger(baselineResultCount) || baselineResultCount < 0) issues.push("baseline_result_count:invalid");
  if (baselineResultCount > 1) issues.push("baseline_result_cardinality:expected_exactly_one");
  if (baselineStatus !== "insufficient_evidence" && baselineStatus !== "missing" && baselineExecutionCount === 0) issues.push(`baseline_execution:status_${baselineStatus}_requires_one_execution`);
  const missingEvidence = scenario.missing_evidence ?? [];
  if ((!scenario.target_present || missingEvidence.length > 0) && baselineStatus !== "insufficient_evidence") issues.push("baseline_status:missing_evidence_requires_insufficient_evidence");
  if (scenario.target_present && missingEvidence.length === 0 && baselineStatus === "insufficient_evidence") issues.push("baseline_status:insufficient_without_missing_evidence");
  const underProcessing = [];
  if (baselineStatus === "missing" || baselineResultCount === 0 || (baselineExecutionCount === 0 && baselineStatus !== "insufficient_evidence")) underProcessing.push(BASELINE_GATE);
  for (const gate of additional) if (!executed.includes(gate)) underProcessing.push(gate);
  if (scenario.final_decision_requested && !executed.includes(FINAL_GATE)) underProcessing.push(FINAL_GATE);
  for (const gate of underProcessing) issues.push(`under_processing:${gate}`);
  const triggered = new Set(additional);
  const overProcessing = [];
  for (const gate of executed) {
    if ((registry.signal_selected_gates ?? []).includes(gate) && !triggered.has(gate) && !overProcessing.includes(gate)) overProcessing.push(gate);
  }
  for (const gate of overProcessing) issues.push(`over_processing:${gate}`);
  if (!scenario.final_decision_requested && executed.includes(FINAL_GATE)) issues.push(`final_gate_overactivation:${FINAL_GATE}`);
  if (scenario.final_decision_requested && executed.at(-1) !== FINAL_GATE) issues.push(`final_gate_not_last:${FINAL_GATE}`);
  const expectedExecutionOrder = [BASELINE_GATE, ...additional, ...(scenario.final_decision_requested ? [FINAL_GATE] : [])];
  if (issues.length === 0 && baselineStatus !== "insufficient_evidence" && JSON.stringify(executed) !== JSON.stringify(expectedExecutionOrder)) issues.push("gate_execution_order:invalid");
  issues.push(...findingIssues(registry, scenario.findings ?? []));
  issues.push(...ordinaryOutputIssues(scenario));
  return { required_gates: requiredGates, additional_required_gates: additional, baseline_status: baselineStatus, under_processing: underProcessing, over_processing: overProcessing, missing_evidence: missingEvidence, findings: scenario.findings ?? [], issues };
}

export { BASELINE_GATE, FINAL_GATE };
