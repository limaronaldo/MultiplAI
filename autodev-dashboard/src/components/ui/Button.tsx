import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: [
    'bg-blue-600',
    'text-white',
    'hover:bg-blue-700',
    'focus:ring-blue-500',
    'disabled:bg-blue-300',
  ].join(' '),
  secondary: [
    'bg-gray-200',
    'text-gray-900',
    'hover:bg-gray-300',
    'focus:ring-gray-500',
    'disabled:bg-gray-100',
    'disabled:text-gray-400',
  ].join(' '),
  danger: [
    'bg-red-600',
    'text-white',
    'hover:bg-red-700',
    'focus:ring-red-500',
    'disabled:bg-red-300',
  ].join(' '),
  ghost: [
    'bg-transparent',
    'text-gray-700',
    'hover:bg-gray-100',
    'focus:ring-gray-500',
    'disabled:text-gray-300',
  ].join(' '),
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-base gap-2',
  lg: 'px-6 py-3 text-lg gap-2.5',
};

const iconSizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = [
      'inline-flex',
      'items-center',
      'justify-center',
      'font-medium',
      'rounded-md',
      'transition-colors',
      'duration-200',
      'focus:outline-none',
      'focus:ring-2',
      'focus:ring-offset-2',
      'disabled:cursor-not-allowed',
    ].join(' ');

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className={`${iconSizes[size]} animate-spin`} />}
        {!isLoading && leftIcon && <span className={iconSizes[size]}>{leftIcon}</span>}
        {children}
        {!isLoading && rightIcon && <span className={iconSizes[size]}>{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
