export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Reloj controlable para pruebas de umbrales (aviso a los 10 minutos, vencimientos). */
export class ManualClock implements Clock {
  constructor(private current: Date) {}
  now() {
    return new Date(this.current);
  }
  set(date: Date) {
    this.current = new Date(date);
  }
  advanceMinutes(minutes: number) {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

export const minutes = (n: number) => n * 60_000;
