export class Cache {
  private values = new Map<string, { expiry: number; value: unknown }>();
  private flights = new Map<string, Promise<unknown>>();
  constructor(private now = Date.now, private capacity = 128) {}
  async get<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.values.get(key);
    if (cached && cached.expiry > this.now()) return cached.value as T;
    const inFlight = this.flights.get(key);
    if (inFlight) return inFlight as Promise<T>;
    const flight = fetcher().then(value => {
      if (this.values.size >= this.capacity) this.values.delete(this.values.keys().next().value!);
      this.values.set(key, { value, expiry: this.now() + ttl }); return value;
    }).finally(() => this.flights.delete(key));
    this.flights.set(key, flight);
    return flight;
  }
}
