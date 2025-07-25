// src/app/(protected)/doctors/_components/doctor-block-calendar-modal.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, ClockIcon } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { blockDate } from "@/actions/block-date.ts/index";
import { adHocAvailability } from "@/actions/ad-hoc-availability.ts/index";
import { blockTimeSlot } from "@/actions/block-time-slot.ts/index";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { getDayJsAvailability } from "../_helpers/availability";
import dayjs from "dayjs";
import { doctorsTable } from "@/db/schema";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(timezone);
dayjs.extend(utc);

const APP_TIMEZONE = "America/Fortaleza";

interface DoctorBlockCalendarModalProps {
  isOpen: boolean;
  onOpenChangeAction: (open: boolean) => void;
  doctor: Pick<
    typeof doctorsTable.$inferSelect,
    | "id"
    | "name"
    | "availableFromWeekDay"
    | "availableToWeekDay"
    | "availableFromTime"
    | "availableToTime"
    | "clinicId"
  >;
}

interface AdminTimeSlot {
  time: string;
  isBlocked: boolean;
}

export default function DoctorBlockCalendarModal({
  isOpen,
  onOpenChangeAction,
  doctor,
}: DoctorBlockCalendarModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [blockedDates, setBlockedDates] = useState<Date[]>([]);
  const [adHocAvailableDates, setAdHocAvailableDates] = useState<Date[]>([]);
  const [blockedTimeSlots, setBlockedTimeSlots] = useState<Set<string>>(
    new Set(),
  );
  const [reason, setReason] = useState("");
  const [currentDaySlots, setCurrentDaySlots] = useState<AdminTimeSlot[]>([]);
  const [refreshKey, setRefreshKey] = useState(0); // NOVO: Variável para forçar re-renderização

  const isDateBlocked = useCallback(
    (date: Date): boolean => {
      const selectedDayJs = dayjs(date).tz(APP_TIMEZONE).startOf("day");
      return blockedDates.some((blockedDate) =>
        dayjs(blockedDate)
          .tz(APP_TIMEZONE)
          .startOf("day")
          .isSame(selectedDayJs, "day"),
      );
    },
    [blockedDates],
  );

  const isDateAdHocAvailable = useCallback(
    (date: Date): boolean => {
      const selectedDayJs = dayjs(date).tz(APP_TIMEZONE).startOf("day");
      return adHocAvailableDates.some((adHocDate) =>
        dayjs(adHocDate)
          .tz(APP_TIMEZONE)
          .startOf("day")
          .isSame(selectedDayJs, "day"),
      );
    },
    [adHocAvailableDates],
  );

  const isDateWithinDoctorAvailability = useCallback(
    (date: Date): boolean => {
      const dayOfWeek = date.getDay();
      const fromDay = doctor.availableFromWeekDay;
      const toDay = doctor.availableToWeekDay;

      if (fromDay <= toDay) {
        return dayOfWeek >= fromDay && dayOfWeek <= toDay;
      } else {
        return dayOfWeek >= fromDay || dayOfWeek <= toDay;
      }
    },
    [doctor.availableFromWeekDay, doctor.availableToWeekDay],
  );

  const isDefaultUnavailable = useCallback(
    (date: Date): boolean => {
      return (
        !isDateWithinDoctorAvailability(date) && !isDateAdHocAvailable(date)
      );
    },
    [isDateWithinDoctorAvailability, isDateAdHocAvailable],
  );

  const blockDateAction = useAction(blockDate, {
    onSuccess: (result) => {
      if (result.data?.success) {
        toast.success(
          result.data.block
            ? "Dia bloqueado com sucesso!"
            : "Dia desbloqueado com sucesso!",
        );
        fetchBlockedAndAdHocDates();
        setReason("");
      } else {
        toast.error(result.data?.error || "Erro na operação do dia.");
      }
    },
    onError: (errorObject) => {
      console.error(
        "Erro ao comunicar com o servidor (blockDateAction):",
        errorObject,
      );
      toast.error(
        (errorObject as any)?.error?.serverError ||
          (errorObject as any)?.error?.message ||
          "Erro ao comunicar com o servidor.",
      );
    },
  });

  const adHocAvailabilityAction = useAction(adHocAvailability, {
    onSuccess: (result) => {
      if (result.data?.success) {
        toast.success(
          result.data.available
            ? "Disponibilidade adicionada com sucesso!"
            : "Disponibilidade removida com sucesso!",
        );
        fetchBlockedAndAdHocDates();
        setReason("");
      } else {
        toast.error(
          result.data?.error || "Erro na operação de disponibilidade.",
        );
      }
    },
    onError: (errorObject) => {
      console.error(
        "Erro ao comunicar com o servidor (adHocAvailabilityAction):",
        errorObject,
      );
      toast.error(
        (errorObject as any)?.error?.serverError ||
          (errorObject as any)?.error?.message ||
          "Erro ao comunicar com o servidor.",
      );
    },
  });

  const blockTimeSlotAction = useAction(blockTimeSlot, {
    onSuccess: (result) => {
      if (result.data?.success) {
        toast.success(
          result.data.block
            ? "Horário bloqueado com sucesso!"
            : "Horário desbloqueado com sucesso!",
        );

        // ATUALIZAÇÃO OTIMISTA: Atualiza o estado local imediatamente
        setCurrentDaySlots((prevSlots) => {
          if (!prevSlots) return [];
          return prevSlots.map((slot) =>
            slot.time === blockTimeSlotAction.input?.time // Verifica se é o slot que foi clicado
              ? { ...slot, isBlocked: result.data!.block } // Atualiza o status isBlocked
              : slot,
          );
        });

        setBlockedTimeSlots((prevSet) => {
          const newSet = new Set(prevSet);
          const toggledTime = blockTimeSlotAction.input?.time;
          if (toggledTime) {
            if (result.data!.block) {
              // Se a ação foi para BLOQUEAR
              newSet.add(toggledTime);
            } else {
              // Se a ação foi para DESBLOQUEAR
              newSet.delete(toggledTime);
            }
          }
          return newSet; // Retorna uma nova referência de Set para o React detectar a mudança
        });

        // Dispara uma re-busca completa para garantir a consistência
        setTimeout(() => {
          // ADICIONADO: Pequeno atraso antes de re-buscar
          if (selectedDate) {
            // Verifica selectedDate novamente, pois é assíncrono
            setRefreshKey((prevKey) => prevKey + 1);
          }
        }, 50); // Atraso de 50ms, pode ser ajustado
      } else {
        toast.error(result.data?.error || "Erro na operação do horário.");
      }
    },
    onError: (errorObject) => {
      console.error(
        "Erro ao comunicar com o servidor (blockTimeSlotAction):",
        errorObject,
      );
      toast.error(
        (errorObject as any)?.error?.serverError ||
          (errorObject as any)?.error?.message ||
          "Erro ao comunicar com o servidor.",
      );
    },
  });

  const fetchBlockedAndAdHocDates = useCallback(async () => {
    if (!doctor.id || !doctor.clinicId) {
      setBlockedDates([]);
      setAdHocAvailableDates([]);
      return;
    }
    try {
      const response = await fetch(
        `/api/blocked-dates?doctorId=${doctor.id}&clinicId=${doctor.clinicId}`,
        { cache: "no-store" },
      );
      if (!response.ok)
        throw new Error("Falha ao buscar dias bloqueados/ad-hoc.");
      const data: { blockedDates: string[]; adHocAvailableDates: string[] } =
        await response.json();

      setBlockedDates(
        data.blockedDates.map((item) => dayjs.tz(item, APP_TIMEZONE).toDate()),
      );
      setAdHocAvailableDates(
        data.adHocAvailableDates.map((item) =>
          dayjs.tz(item, APP_TIMEZONE).toDate(),
        ),
      );
    } catch (err: unknown) {
      console.error("Erro ao carregar dias bloqueados/ad-hoc para o admin:");
      toast.error("Erro ao carregar dias de agenda para o médico.");
    }
  }, [doctor.id, doctor.clinicId]);

  const fetchBlockedTimeSlotsForSelectedDate = useCallback(
    async (date: Date) => {
      if (!doctor.id || !doctor.clinicId) {
        setBlockedTimeSlots(new Set());
        setCurrentDaySlots([]);
        return;
      }

      const formattedDate = format(date, "yyyy-MM-dd");

      try {
        const doctorAvailability = getDayJsAvailability(doctor);
        const allPossibleSlotsForDay = [];
        let currentTime = dayjs(date)
          .hour(doctorAvailability.from.hour())
          .minute(doctorAvailability.from.minute())
          .second(doctorAvailability.from.second());

        const endOfDay = dayjs(date)
          .hour(doctorAvailability.to.hour())
          .minute(doctorAvailability.to.minute())
          .second(doctorAvailability.to.second());

        while (currentTime.isBefore(endOfDay)) {
          allPossibleSlotsForDay.push(currentTime.format("HH:mm"));
          currentTime = currentTime.add(30, "minute");
        }

        const response = await fetch(
          `/api/blocked-time-slots?doctorId=${doctor.id}&clinicId=${doctor.clinicId}&date=${formattedDate}`,
          { cache: "no-store" },
        );
        if (!response.ok)
          throw new Error("Falha ao buscar horários bloqueados.");
        const data: { blockedTimes: string[] } = await response.json();
        const newBlockedTimeSlots = new Set(data.blockedTimes);
        setBlockedTimeSlots(newBlockedTimeSlots);

        const combinedSlots: AdminTimeSlot[] = allPossibleSlotsForDay.map(
          (time) => ({
            time: time,
            isBlocked: newBlockedTimeSlots.has(time),
          }),
        );
        setCurrentDaySlots(combinedSlots);
      } catch (err: unknown) {
        console.error("Erro ao carregar horários para o dia:", err);
        toast.error("Erro ao carregar horários para o dia selecionado.");
        setCurrentDaySlots([]);
      }
    },
    [
      doctor.id,
      doctor.clinicId,
      doctor.availableFromTime,
      doctor.availableToTime,
    ],
  );

  useEffect(() => {
    if (isOpen) {
      fetchBlockedAndAdHocDates();
    } else {
      setSelectedDate(undefined);
      setReason("");
      setBlockedTimeSlots(new Set());
      setCurrentDaySlots([]);
    }
  }, [isOpen, doctor.id, doctor.clinicId, fetchBlockedAndAdHocDates]);

  // ATUALIZADO: Adicionado refreshKey como dependência para forçar re-renderização
  useEffect(() => {
    if (selectedDate) {
      if (isDateBlocked(selectedDate)) {
        setCurrentDaySlots([]);
        setBlockedTimeSlots(new Set());
      } else {
        fetchBlockedTimeSlotsForSelectedDate(selectedDate);
      }
    } else {
      setCurrentDaySlots([]);
      setBlockedTimeSlots(new Set());
    }
  }, [
    selectedDate,
    isDateBlocked,
    fetchBlockedTimeSlotsForSelectedDate,
    refreshKey,
  ]);

  const handleDatesChange = (date: Date | undefined) => {
    setSelectedDate(date);
    setReason("");
  };

  const handleBlockToggle = () => {
    if (!selectedDate) {
      toast.error("Por favor, selecione uma data.");
      return;
    }
    const formattedDate = format(selectedDate, "yyyy-MM-dd");
    blockDateAction.execute({
      doctorId: doctor.id,
      date: formattedDate,
      block: !isDateBlocked(selectedDate),
      reason,
      clinicId: doctor.clinicId,
    });
  };

  const handleAdHocToggle = () => {
    if (!selectedDate) {
      toast.error("Por favor, selecione uma data.");
      return;
    }
    const formattedDate = format(selectedDate, "yyyy-MM-dd");
    adHocAvailabilityAction.execute({
      doctorId: doctor.id,
      date: formattedDate,
      available: !isDateAdHocAvailable(selectedDate),
      reason,
      clinicId: doctor.clinicId,
    });
  };

  const handleTimeSlotToggle = (time: string) => {
    if (!selectedDate) {
      toast.error("Por favor, selecione uma data primeiro.");
      return;
    }
    const formattedDate = format(selectedDate, "yyyy-MM-dd");
    blockTimeSlotAction.execute({
      doctorId: doctor.id,
      clinicId: doctor.clinicId,
      date: formattedDate,
      time: time,
      block: !blockedTimeSlots.has(time),
      reason: reason,
    });
  };

  // Determina se o dia selecionado é gerenciável para slots
  const isSelectedDayManagable =
    selectedDate &&
    (isDateWithinDoctorAvailability(selectedDate) ||
      isDateAdHocAvailable(selectedDate)) &&
    !isDateBlocked(selectedDate);

  const modifiers = {
    blocked: blockedDates,
    adHocAvailable: adHocAvailableDates,
    workingDays: (date: Date) => isDateWithinDoctorAvailability(date),
    defaultUnavailable: isDefaultUnavailable,
  };

  const modifiersClassNames = {
    blocked: "bg-red-500 text-white rounded-full",
    adHocAvailable: "bg-green-500 text-white rounded-full",
    defaultUnavailable: "bg-red-100 text-red-800",
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
      <DialogHeader>
        <DialogTitle>Bloquear/Adicionar Agenda para {doctor.name}</DialogTitle>
        <DialogDescription>
          Selecione dias e horários para gerenciar a agenda de {doctor.name}.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col items-start gap-6 py-4 md:flex-row">
        {/* Coluna do Calendário */}
        <div className="flex w-full flex-col items-center gap-4 md:w-1/2">
          <CalendarIcon className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Calendário</h2>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDatesChange}
            className="rounded-md border"
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            disabled={(date) => date < new Date()}
          />
          {selectedDate && (
            <div className="flex w-full max-w-sm flex-col gap-2">
              <p className="text-center font-medium">
                Data Selecionada:{" "}
                {format(selectedDate, "PPP", { locale: ptBR })}
              </p>

              <Input
                placeholder="Motivo (opcional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={
                  blockDateAction.isPending ||
                  adHocAvailabilityAction.isPending ||
                  blockTimeSlotAction.isPending
                }
              />

              <Button
                onClick={handleBlockToggle}
                disabled={
                  blockDateAction.isPending ||
                  adHocAvailabilityAction.isPending ||
                  blockTimeSlotAction.isPending
                }
                variant={
                  isDateBlocked(selectedDate) ? "destructive" : "outline"
                }
              >
                {blockDateAction.isPending
                  ? "Processando..."
                  : isDateBlocked(selectedDate)
                    ? "Desbloquear Dia Inteiro"
                    : "Bloquear Dia Inteiro"}
              </Button>

              <Button
                onClick={handleAdHocToggle}
                disabled={
                  blockDateAction.isPending ||
                  adHocAvailabilityAction.isPending ||
                  blockTimeSlotAction.isPending
                }
                variant={
                  isDateAdHocAvailable(selectedDate) ? "default" : "outline"
                }
              >
                {adHocAvailabilityAction.isPending
                  ? "Processando..."
                  : isDateAdHocAvailable(selectedDate)
                    ? "Remover Ad-Hoc"
                    : "Adicionar Ad-Hoc"}
              </Button>
            </div>
          )}
        </div>

        {/* Coluna de Horários */}
        <div className="mt-6 flex w-full flex-col items-center gap-4 md:mt-0 md:w-1/2">
          <ClockIcon className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Horários do Dia</h2>
          {selectedDate ? (
            currentDaySlots.length > 0 ? (
              <div className="grid w-full grid-cols-3 gap-2">
                {currentDaySlots.map((slot) => (
                  <Button
                    key={slot.time}
                    type="button"
                    onClick={() => handleTimeSlotToggle(slot.time)}
                    disabled={
                      !isSelectedDayManagable ||
                      blockTimeSlotAction.isPending ||
                      blockDateAction.isPending ||
                      adHocAvailabilityAction.isPending
                    }
                    variant={slot.isBlocked ? "destructive" : "outline"}
                    className="h-10"
                  >
                    {blockTimeSlotAction.isPending &&
                    blockTimeSlotAction.input?.time === slot.time
                      ? "..."
                      : slot.time}
                  </Button>
                ))}
              </div>
            ) : isDateBlocked(selectedDate) ? (
              <p className="text-gray-500">
                O dia inteiro está bloqueado. Não é possível gerenciar horários
                individuais.
              </p>
            ) : (
              <p className="text-gray-500">
                Nenhum horário configurado ou disponível para este dia.
              </p>
            )
          ) : (
            <p className="text-gray-500">
              Selecione uma data para ver os horários.
            </p>
          )}
        </div>
      </div>
    </DialogContent>
  );
}
