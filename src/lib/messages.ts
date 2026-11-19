export const MOTIVATION = [
  "Një vakt i keq nuk e shkatërron progresin tënd.",
  "Nuk ke nevojë të rifillosh nesër. Vazhdo TANI.",
  "Qëndrueshmëria është më e rëndësishme se përsosmëria.",
  "Mos e kthe një gabim në një ditë të tërë të keqe.",
  "Qëllimi yt është 90 kg. Çdo vendim i mirë llogaritet.",
];

export type Slot = "morning" | "afternoon" | "evening";

export const REMINDERS: Record<Slot, { hour: number; title: string; body: string; prefKey: string }> = {
  morning: {
    hour: 8,
    title: "08:00 – DISIPLINA E MËNGJESIT",
    body: "Mirëmëngjes! Qëllimi yt është 90 kg. Pi ujë, kryej 20 minuta biçikletë nëse e ke në plan dhe ndiq planin e mëngjesit. Fillo fort!",
    prefKey: "remind_morning",
  },
  afternoon: {
    hour: 15,
    title: "15:00 – KONTROLLO DËSHIRAT",
    body: "Ndalu një moment. A ke uri apo thjesht dëshirë për ushqim? Mos ha impulsivisht. Zgjidh vaktin e planifikuar. Mos harro: nuk ke nevojë të rifillosh nesër.",
    prefKey: "remind_afternoon",
  },
  evening: {
    hour: 19,
    title: "19:00 – DISIPLINA E MBRËMJES",
    body: "Qëndro i qëndrueshëm! Ha darkën e planifikuar. Edhe nëse ke gabuar sot, vazhdo me vaktin e radhës. Mos u dorëzo kurrë për qëllimin 90 kg.",
    prefKey: "remind_evening",
  },
};

export function slotForHour(hour: number): Slot | null {
  if (hour === 8) return "morning";
  if (hour === 15) return "afternoon";
  if (hour === 19) return "evening";
  return null;
}

// Kujtuesi aktiv brenda aplikacionit (rezervë kur push nuk funksionon)
export function activeInAppSlot(hour: number): Slot | null {
  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 15 && hour < 18) return "afternoon";
  if (hour >= 19 && hour < 23) return "evening";
  return null;
}
