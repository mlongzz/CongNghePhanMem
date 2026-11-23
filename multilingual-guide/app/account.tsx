import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, LoadingState, ErrorMessage, panel } from '../src/components/Screen';
import { AuthTextField, PrimaryButton, LanguageSelector } from '../src/components/auth';
import { useApp } from '../src/context/AppContext';
import { apiFetch, type UserResponse } from '../src/services/api';
import type { Language } from '../src/data/places';
import { useI18n } from '../src/hooks/useI18n';
import { validateGmail } from '../src/services/authValidation';
import PresencePrivacy from '../src/components/PresencePrivacy';

function AccountForm() {
  const { t } = useI18n();
  const { token, user, setLanguage, updateProfile } = useApp();
  const [name, setName] = useState(user?.full_name ?? ''); const [email, setEmail] = useState(user?.email ?? ''); const [language, chooseLanguage] = useState(user?.language ?? 'vi');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [emailError, setEmailError] = useState('');
  const save = async () => {
    if (!token || !user || busy) return;
    const nextEmailError = validateGmail(email);
    setEmailError(nextEmailError); setError(''); setNotice('');
    if (!name.trim() || Array.from(name.trim()).length > 100) { setError('Nhập tên từ 1–100 ký tự.'); return; }
    if (nextEmailError) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiFetch<UserResponse>(`/users/${user.id}`, { token, method: 'PUT', body: JSON.stringify({ full_name: name.trim(), email: email.trim(), language }) });
      updateProfile(result); setLanguage(language as Language); setNotice('Đã cập nhật hồ sơ.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được hồ sơ.'); }
    finally { setBusy(false); }
  };
  if (!token) return <LoadingState />;
  return <Screen title="Hồ sơ tài khoản"><View style={panel}>
    <AuthTextField label="Họ và tên" value={name} onChangeText={setName} autoComplete="name" autoCapitalize="words" editable={!busy} />
    <AuthTextField label="Email" value={email} onChangeText={value => { setEmail(value); setEmailError(''); }} error={emailError} autoComplete="email" keyboardType="email-address" editable={!busy} />
    <LanguageSelector value={language} onChange={v => { if (!busy) chooseLanguage(v); }} />
    <ErrorMessage message={error} />{!!notice && <Text accessibilityRole="alert">{t(notice)}</Text>}
    <PrimaryButton title="Lưu hồ sơ" loading={busy} onPress={() => void save()} />
  </View><PresencePrivacy token={token}/></Screen>;
}

export default function Account() {
  const { user, token } = useApp();
  if (!token || !user) return <LoadingState />;
  return <AccountForm key={user.id} />;
}
