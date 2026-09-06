'use client';

import { useState, type ChangeEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordField({
  name,
  placeholder,
  autoComplete,
  minLength = 8,
  required = true,
  value,
  onChange,
  disabled,
}: {
  name: string;
  placeholder?: string;
  autoComplete: string;
  minLength?: number;
  required?: boolean;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="auth-password-wrap">
      <input
        type={visible ? 'text' : 'password'}
        name={name}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <button
        className="auth-password-toggle"
        type="button"
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
      </button>
    </span>
  );
}
