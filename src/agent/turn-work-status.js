export function workExitCode(result) {
  if (!result.ok) return 1;
  if (result.run?.status === 'succeeded') return 0;
  if (['failed', 'expired', 'cancelled'].includes(result.run?.status) ||
      ['refused', 'expired', 'needs-user-action', 'cancelled'].includes(result.turn.state)) return 1;
  if (['busy', 'lease-lost', 'aborted', 'step-limit'].includes(result.reason) ||
      result.turn.state === 'preparing') return 1;
  return 0;
}
