
export async function withBudgetRetry(work) {
  try {
    return await work(false);
  } catch (err) {
    if (!/safety budget/i.test(err?.message ?? "")) throw err;
    const go = window.confirm(
      `${err.message}\n\nContinue anyway on your own key?`,
    );
    if (!go) throw err;
    return await work(true);
  }
}
