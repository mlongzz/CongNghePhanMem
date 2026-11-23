export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const GMAIL_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9]+)*(?:\+[a-z0-9]+(?:[._-][a-z0-9]+)*)?@gmail\.com$/i;
export const INVALID_GMAIL_MESSAGE = 'Vui lòng nhập địa chỉ Gmail hợp lệ có đuôi @gmail.com.';

export function validateGmail(email: string): string {
  if (!email.trim()) return 'Vui lòng nhập email.';
  const value = email.trim();
  return value.split('@')[0].length <= 64 && GMAIL_PATTERN.test(value) ? '' : INVALID_GMAIL_MESSAGE;
}

export type PasswordIssue = 'length' | 'lower' | 'upper' | 'digit';

export function passwordIssues(password: string): PasswordIssue[] {
  const length = Array.from(password).length;
  const issues: PasswordIssue[] = [];
  if (length < PASSWORD_MIN || length > PASSWORD_MAX) issues.push('length');
  if (!/[a-z]/.test(password)) issues.push('lower');
  if (!/[A-Z]/.test(password)) issues.push('upper');
  if (!/[0-9]/.test(password)) issues.push('digit');
  return issues;
}

export const isStrongPassword = (password: string) => passwordIssues(password).length === 0;

export const WEAK_PASSWORD_MESSAGE = 'Mật khẩu cần 8–128 ký tự, có chữ thường, chữ hoa và chữ số.';

export function validateAuth({ register, name, email, password, confirm }: {
  register: boolean; name: string; email: string; password: string; confirm: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const emailError = validateGmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = 'Vui lòng nhập mật khẩu.';
  if (register) {
    if (!name.trim()) errors.name = 'Vui lòng nhập họ và tên.';
    else if (Array.from(name.trim()).length > 100) errors.name = 'Họ và tên tối đa 100 ký tự.';
    if (password && !isStrongPassword(password)) errors.password = WEAK_PASSWORD_MESSAGE;
    if (!confirm) errors.confirm = 'Vui lòng nhập lại mật khẩu.';
    else if (confirm !== password) errors.confirm = 'Mật khẩu xác nhận chưa khớp.';
  }
  return errors;
}
