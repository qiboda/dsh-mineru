/**
 * dsh-mineru source stub.
 *
 * The runtime artifact is lib/index.js (plain ESM, no build step required).
 * This file is kept for documentation / type-sketching only.
 *
 * Host half responsibilities:
 *  - register mineru_parse_pdf / mineru_list_parses tools
 *  - register /mineru/api/*, /mineru/preview/*, /mineru/download/* web routes
 *  - detect Chinese date-digit loss in MinerU output and auto-retry with OCR
 */
export const name = 'dsh-mineru'
export function apply() {}
export default { name, apply }
