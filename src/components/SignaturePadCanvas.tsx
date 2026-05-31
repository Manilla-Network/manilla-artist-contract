import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import SignaturePad from "signature_pad";

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
};

export const SignaturePadCanvas = forwardRef<SignaturePadHandle, { onChange?: (empty: boolean) => void }>(
  function SignaturePadCanvas({ onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePad | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const resize = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const { width } = canvas.getBoundingClientRect();
        canvas.width = width * ratio;
        canvas.height = 180 * ratio;
        const ctx = canvas.getContext("2d");
        ctx?.scale(ratio, ratio);
        padRef.current?.clear();
      };
      const pad = new SignaturePad(canvas, {
        backgroundColor: "rgba(255,255,255,0)",
        penColor: "#0a0a0a",
        minWidth: 0.8,
        maxWidth: 2.4,
      });
      pad.addEventListener("endStroke", () => onChange?.(pad.isEmpty()));
      padRef.current = pad;
      resize();
      window.addEventListener("resize", resize);
      return () => {
        window.removeEventListener("resize", resize);
        pad.off();
      };
    }, [onChange]);

    useImperativeHandle(ref, () => ({
      clear: () => {
        padRef.current?.clear();
        onChange?.(true);
      },
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataURL: () => padRef.current?.toDataURL("image/png") ?? "",
    }));

    return (
      <canvas
        ref={canvasRef}
        style={{ touchAction: "none", height: 180, width: "100%" }}
        className="w-full rounded-lg border-2 border-dashed border-primary/40 bg-white"
      />
    );
  },
);
