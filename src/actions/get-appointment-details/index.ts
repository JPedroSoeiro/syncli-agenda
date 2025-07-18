// src/actions/get-appointment-details/index.ts
"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  appointmentsTable,
  clinicsTable,
  doctorsTable,
  patientsTable,
} from "@/db/schema";

export interface AppointmentDetails {
  id: string;
  date: Date;
  appointmentPriceInCents: number;
  patientName: string;
  patientEmail: string;
  doctorName: string;
  doctorSpecialty: string;
  modality: "remoto" | "presencial";
  clinicPhoneNumber: string | null;
  // >>> CORREÇÃO AQUI: Adicionar clinicAddress ao tipo AppointmentDetails <<<
  clinicAddress: string | null; // <<< Adicionado clinicAddress
}

export async function getAppointmentDetailsAction(
  appointmentId: string,
): Promise<AppointmentDetails | null> {
  try {
    const appointment = await db
      .select({
        id: appointmentsTable.id,
        date: appointmentsTable.date,
        appointmentPriceInCents: appointmentsTable.appointmentPriceInCents,
        patientName: patientsTable.name,
        patientEmail: patientsTable.email,
        doctorName: doctorsTable.name,
        doctorSpecialty: doctorsTable.specialty,
        modality: appointmentsTable.modality,
        clinicPhoneNumber: clinicsTable.phoneNumber,
        clinicAddress: clinicsTable.address, // Seleciona o endereço
      })
      .from(appointmentsTable)
      .innerJoin(
        patientsTable,
        eq(appointmentsTable.patientId, patientsTable.id),
      )
      .innerJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
      .innerJoin(clinicsTable, eq(appointmentsTable.clinicId, clinicsTable.id)) // Garante que clinicsTable está no join
      .where(eq(appointmentsTable.id, appointmentId))
      .limit(1);

    return appointment[0] || null;
  } catch (error) {
    console.error(
      "Erro ao buscar detalhes do agendamento (Server Action):",
      error,
    );
    return null;
  }
}
