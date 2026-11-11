type Activity<Props> = {
  getId(): string;
  update(props: Props): Promise<void>;
  end(policy: "immediate"): Promise<void>;
};

type Factory<Props> = {
  start(props: Props, url: string): Activity<Props>;
  getInstances(): Activity<Props>[];
};

export const callActivityURL = (callId: string) =>
  `mates:///call?activityCallId=${encodeURIComponent(callId)}`;

/** Serializes the native lifecycle while invalidating work for a call that has already ended. */
export function createCallActivityController<Props extends { callId: string }>(
  getFactory: () => Factory<Props> | null,
  prepare: (props: Props) => Promise<Props> = async (props) => props,
  report: (operation: string, error: unknown) => void = () => {},
) {
  let active: Activity<Props> | null = null;
  let callId: string | null = null;
  let generation = 0;
  let operations = Promise.resolve();

  function serialize(operation: () => Promise<void>) {
    // The native bridge can throw synchronously as well as reject a promise.
    const next = operations.then(operation).catch((error) => report("operation", error));
    operations = next;
    return next;
  }

  async function endInstances(factory: Factory<Props>) {
    const instances = new Map<string, Activity<Props>>();
    try {
      for (const instance of factory.getInstances()) instances.set(instance.getId(), instance);
    } catch (error) {
      report("enumerate", error);
    }
    const previous = active;
    active = null;
    if (previous) instances.set(previous.getId(), previous);
    await Promise.all([...instances.values()].map(async (instance) => {
      try { await instance.end("immediate"); }
      catch (error) { report("end", error); }
    }));
  }

  return {
    getCallId: () => callId,
    start(props: Props) {
      callId = props.callId;
      const attempt = ++generation;
      return serialize(async () => {
        if (attempt !== generation) return;
        const factory = getFactory();
        if (!factory) return;
        await endInstances(factory);
        if (attempt !== generation) return;
        const prepared = await prepare(props);
        if (attempt !== generation) return;
        active = factory.start(prepared, callActivityURL(props.callId));
      });
    },
    update(props: Props) {
      const attempt = generation;
      return serialize(async () => {
        if (attempt !== generation || props.callId !== callId || !active) return;
        const prepared = await prepare(props);
        if (attempt !== generation || props.callId !== callId || !active) return;
        await active.update(prepared);
      });
    },
    end() {
      callId = null;
      generation++;
      return serialize(async () => {
        const factory = getFactory();
        if (factory) await endInstances(factory);
        else active = null;
      });
    },
    clearOrphans() {
      const attempt = generation;
      if (callId !== null) return Promise.resolve();
      return serialize(async () => {
        // A call may have started between mounting the provider and native enumeration.
        if (attempt !== generation || callId !== null) return;
        const factory = getFactory();
        if (factory) await endInstances(factory);
      });
    },
  };
}
