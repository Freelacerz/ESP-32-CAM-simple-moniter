interface Props {
  size?: "sm" | "md" | "lg";
}

export function MonoployezLogo({ size = "md" }: Props) {
  // Responsive sizing so the logo "auto-fits" small screens.
  const cls = {
    sm: "text-[clamp(1rem,4vw,1.25rem)] px-[clamp(0.5rem,2vw,0.75rem)] py-[clamp(0.2rem,1vw,0.35rem)]",
    md: "text-[clamp(1.5rem,6vw,2.25rem)] px-[clamp(0.75rem,2.5vw,1rem)] py-[clamp(0.25rem,1.25vw,0.5rem)]",
    lg: "text-[clamp(2rem,8vw,3.75rem)] px-[clamp(0.9rem,3vw,1.5rem)] py-[clamp(0.3rem,1.5vw,0.75rem)]",
  }[size];

  const title = "MONOPLOYEZ GO";
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className={`monoployez-title ${cls} max-w-[92vw] text-center leading-[0.9] whitespace-normal`}>
        {title}
      </div>
      <div className="font-condensed text-[0.6rem] text-muted-foreground tracking-[0.3em]">
        ONLINE · MULTIPLAYER
      </div>
    </div>
  );
}
