// Nis planifikuesin e kujtuesve kur niset serveri (Railway e mban serverin gjithmonë aktiv).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
