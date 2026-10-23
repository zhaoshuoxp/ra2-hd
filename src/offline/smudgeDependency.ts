// A declared legacy name is not generated unless its effective rules opt in.
export function isGeneratedGroundSmudge(rule: { crater?: boolean; burn?: boolean }): boolean {
    return !!(rule.crater || rule.burn);
}
