import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: string; message: string };

const Ctx = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, message }]);
    setTimeout(() => setItems((prev) => prev.filter((item) => item.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed top-4 right-4 z-[80] flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className="glass min-w-52 rounded-xl px-3 py-2 text-sm shadow-lg">
            {item.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
