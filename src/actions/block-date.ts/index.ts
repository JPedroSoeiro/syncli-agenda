// src/actions/block-date.ts/index.ts
"use server";

import { db } from "@/db";
import { blockedDatesTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { actionClient } from "@/lib/next-safe-action";
import { z } from "zod";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(timezone);

const APP_TIMEZONE = "America/Fortaleza";

const blockDateSchema = z.object({
  doctorId: z.string().uuid(),
  clinicId: z.string().uuid(), // <<< ADICIONADO: clinicId ao schema
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (YYYY-MM-DD)"),
  block: z.boolean(),
  reason: z.string().optional().nullable(),
});

export const blockDate = actionClient
  .schema(blockDateSchema)
  .action(async ({ parsedInput }) => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.clinic?.id) {
      return {
        success: false,
        error: "Clínica não encontrada ou não autorizado.",
        block: parsedInput.block,
      };
    }
    const clinicIdFromSession = session.user.clinic.id;

    if (clinicIdFromSession !== parsedInput.clinicId) {
      return {
        success: false,
        error: "Clínica incompatível ou não autorizado para esta operação.",
        block: parsedInput.block,
      };
    }

    const targetDate = dayjs
      .tz(parsedInput.date, APP_TIMEZONE)
      .startOf("day")
      .toDate();

    try {
      if (parsedInput.block) {
        await db
          .insert(blockedDatesTable)
          .values({
            clinicId: parsedInput.clinicId,
            doctorId: parsedInput.doctorId,
            date: targetDate,
            reason: parsedInput.reason || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoNothing({
            target: [blockedDatesTable.doctorId, blockedDatesTable.date],
          });
      } else {
        await db
          .delete(blockedDatesTable)
          .where(
            and(
              eq(blockedDatesTable.clinicId, parsedInput.clinicId),
              eq(blockedDatesTable.doctorId, parsedInput.doctorId),
              eq(blockedDatesTable.date, targetDate),
            ),
          );
      }

      revalidatePath("/public-booking");
      revalidatePath("/doctors");
      revalidatePath("/api/available-slots"); // Revalidar slots também

      return { success: true, block: parsedInput.block };
    } catch (error) {
      console.error("Erro ao bloquear/desbloquear data:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Falha ao operar a data.",
        block: parsedInput.block,
      };
    }
  });
