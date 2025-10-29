import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";

type ButtonVariant = "primary" | "secondary" | "ghost" | "icon" | "orange";
type ButtonSize = "sm" | "md" | "lg";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
};

type ButtonProps = CommonProps &
  (
    | ({ href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>)
    | ({ href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>)
  );

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const baseClasses =
  "inline-flex select-none items-center justify-center rounded-xl font-semibold focus-visible:outline-none transition will-change-transform";

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-sm px-3 py-1.5 gap-2",
  md: "text-sm px-4 py-2 gap-2",
  lg: "text-base px-5 py-3 gap-2",
};

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "text-[#0b1220] bg-[linear-gradient(90deg,#00ffc8,#7affc0)] shadow-[0_0_0_0_rgba(0,0,0,0)] hover:shadow-[0_0_24px_0_rgba(122,255,192,0.35)] focus-visible:ring-2 focus-visible:ring-[rgba(122,255,192,0.45)]",
  secondary:
    "text-[var(--accent)] border border-[color:var(--accent)]/60 bg-transparent hover:bg-[color:var(--accent)]/10 focus-visible:ring-2 focus-visible:ring-[rgba(122,255,192,0.35)]",
  ghost:
    "bg-transparent text-[var(--accent)] hover:text-white hover:[text-shadow:0_0_12px_rgba(122,255,192,0.6)] focus-visible:ring-2 focus-visible:ring-[rgba(122,255,192,0.25)]",
  icon:
    "text-[var(--text)]/80 bg-white/0 border border-white/15 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[rgba(122,255,192,0.25)]",
  orange:
    "text-[#0b1220] bg-[linear-gradient(90deg,#ffd48a,#ff9b4a)] shadow-[0_0_0_0_rgba(0,0,0,0)] hover:shadow-[0_0_24px_0_rgba(255,155,74,0.35)] focus-visible:ring-2 focus-visible:ring-[rgba(255,155,74,0.45)]",
};

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    icon,
    className,
    children,
    ariaLabel,
    href,
    ...rest
  } = props as any;

  const isIconOnly = variant === "icon" && !children;

  const classes = cx(
    baseClasses,
    variantClasses[variant],
    isIconOnly ? iconSizeClasses[size] : sizeClasses[size],
    isIconOnly ? "rounded-full" : "rounded-xl",
    className
  );

  const content = (
    <motion.span
      className={cx("inline-flex items-center", isIconOnly ? "" : "gap-2")}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
    >
      {icon}
      {children && <span>{children}</span>}
    </motion.span>
  );

  if (href) {
    const { href: _href, ...anchorRest } = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <Link href={href} aria-label={ariaLabel} className={classes} {...(anchorRest as any)}>
        {content}
      </Link>
    );
  }

  const { type, ...buttonRest } = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type || "button"} aria-label={ariaLabel} className={classes} {...buttonRest}>
      {content}
    </button>
  );
}

export default Button;
