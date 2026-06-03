import { gsap } from "gsap";
import { memo, useEffect, useRef } from "react";

const INDICATOR_SQUARE_COUNT = 16;

export const ThreadRunningIndicator = memo(function ThreadRunningIndicator({
  active,
}: {
  active: boolean;
}) {
  const squaresRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const squares = squaresRef.current.filter(
      (square): square is HTMLSpanElement => square !== null,
    );
    if (!active || squares.length === 0) {
      return;
    }

    gsap.killTweensOf(squares);

    const tween = gsap.fromTo(
      squares,
      {
        opacity: 0.22,
        scale: 0.92,
        backgroundColor: "rgba(255,255,255,0.22)",
      },
      {
        opacity: 1,
        scale: 1,
        backgroundColor: "rgba(255,255,255,0.95)",
        duration: 0.5,
        ease: "sine.inOut",
        stagger: {
          each: 0.035,
          repeat: -1,
          yoyo: true,
          grid: [4, 4],
          from: "center",
        },
      },
    );

    return () => {
      tween.kill();
      gsap.killTweensOf(squares);
    };
  }, [active]);

  return (
    <span
      data-pipper-id="thread-running-indicator"
      aria-hidden="true"
      className="grid size-3.5 shrink-0 grid-cols-4 grid-rows-4 gap-[1px]"
    >
      {Array.from({ length: INDICATOR_SQUARE_COUNT }, (_, index) => (
        <span
          key={index}
          ref={(node) => {
            squaresRef.current[index] = node;
          }}
          className="block rounded-[1px] bg-white/25"
        />
      ))}
    </span>
  );
});
