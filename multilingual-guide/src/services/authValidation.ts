export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (!email.trim()) errors.email = 'Vui lòng nhập email.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Email không hợp lệ.';
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
