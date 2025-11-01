import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTheme } from "./ThemeProvider";

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
    "text-white bg-telegram-blue shadow-[0_2px_8px_rgba(51,144,236,0.25)] hover:bg-telegram-blue-dark hover:shadow-[0_4px_16px_rgba(51,144,236,0.35)] focus-visible:ring-2 focus-visible:ring-telegram-blue/50 active:scale-[0.98] transition-all duration-200",
  secondary:
    "text-telegram-blue border-2 border-telegram-blue bg-transparent hover:bg-telegram-blue/15 hover:border-telegram-blue-dark focus-visible:ring-2 focus-visible:ring-telegram-blue/30 active:scale-[0.98] transition-all duration-200 backdrop-blur-sm",
  ghost:
    "bg-transparent text-telegram-blue hover:text-telegram-blue-light hover:bg-telegram-blue/10 focus-visible:ring-2 focus-visible:ring-telegram-blue/25 active:scale-[0.98] transition-all duration-200",
  icon:
    "text-telegram-text-secondary bg-telegram-bg-secondary/50 border border-telegram-text-secondary/20 hover:bg-telegram-blue/15 hover:text-telegram-blue hover:border-telegram-blue/30 focus-visible:ring-2 focus-visible:ring-telegram-blue/25 active:scale-[0.98] transition-all duration-200",
  orange:
    "text-white bg-[linear-gradient(90deg,#ffd48a,#ff9b4a)] shadow-[0_2px_8px_rgba(255,155,74,0.25)] hover:shadow-[0_4px_16px_rgba(255,155,74,0.35)] focus-visible:ring-2 focus-visible:ring-[rgba(255,155,74,0.45)] active:scale-[0.98] transition-all duration-200",
};

// Light theme overrides for buttons
const lightThemeVariantClasses: Record<ButtonVariant, string> = {
  primary: "text-white bg-telegram-blue shadow-[0_2px_8px_rgba(51,144,236,0.2)] hover:bg-telegram-blue-dark hover:shadow-[0_4px_16px_rgba(51,144,236,0.3)]",
  secondary: "text-telegram-blue border-2 border-telegram-blue bg-white/80 backdrop-blur-sm hover:bg-telegram-blue/10 hover:border-telegram-blue-dark",
  ghost: "bg-transparent text-telegram-blue hover:text-telegram-blue-dark hover:bg-telegram-hover",
  icon: "text-telegram-text-secondary bg-telegram-hover border border-telegram-text-secondary/20 hover:bg-telegram-blue/10 hover:text-telegram-blue",
  orange: "text-white bg-[linear-gradient(90deg,#ffd48a,#ff9b4a)] shadow-[0_2px_8px_rgba(255,155,74,0.2)] hover:shadow-[0_4px_16px_rgba(255,155,74,0.3)]",
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

  const { theme } = useTheme();
  const isLight = theme === "light";
  const isIconOnly = variant === "icon" && !children;

  const classes = cx(
    baseClasses,
    isLight ? lightThemeVariantClasses[variant] : variantClasses[variant],
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
