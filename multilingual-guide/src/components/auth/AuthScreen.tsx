import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Platform, Text, View, type TextInputInstance } from 'react-native';
import { AuthLayout, AuthTextField, PrimaryButton, LanguageSelector, PasswordStrength } from './index';
import { useApp } from '../../context/AppContext';
import { ApiError, registerUser, signIn } from '../../services/api';
import { classifyLoginError, formatCountdown } from '../../services/authErrors';
import { sanitizeRedirect } from '../../services/authRedirect';
import { validateAuth, validateGmail } from '../../services/authValidation';
import { type Language } from '../../data/places';
import { C } from '../../theme/colors';
import { useI18n } from '../../hooks/useI18n';

const subscribeHydration = () => () => {};
const clientHydration = () => true;
const serverHydration = () => false;

export function AuthScreen({ register = false }: { register?: boolean }) {
  const { authLoading, loginWithTokens, setLanguage, language: currentLanguage, sessionNotice, sessionExpired } = useApp();
  const { t } = useI18n();
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydration, serverHydration);
  const formReady = (Platform.OS !== 'web' || hydrated) && !authLoading;
  const params = useLocalSearchParams<{ registered?: string; email?: string; redirect?: string }>();
  const redirect = sanitizeRedirect(params.redirect);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [language, chooseLanguage] = useState(currentLanguage);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const remaining = Math.max(0, Math.ceil((lockUntil - now) / 1000));
  const locked = remaining > 0;
  useEffect(() => {
    if (!lockUntil) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockUntil) { setLockUntil(0); setError(''); }
    }, 500);
    return () => clearInterval(timer);
  }, [lockUntil]);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);
  const submit = async () => {
    if (submitting.current || !formReady || locked) return;
    const next = validateAuth({ register, name, email, password, confirm });
    setErrors(next); setError(''); setErrorKind('');
    if (Object.keys(next).length) return;
    submitting.current = true; setBusy(true);
    try {
      if (register) {
        await registerUser(name.trim(), email.trim(), password, language);
        setLanguage(language as Language);
        router.replace({ pathname: '/login', params: { registered: '1', email: email.trim(), ...(redirect ? { redirect } : {}) } });
      } else {
        const result = await signIn(email.trim(), password);
        if (!result.access_token) throw new Error('Không thể đăng nhập. Vui lòng thử lại.');
        await loginWithTokens(result.access_token, result.refresh_token);
      }
    } catch (e) {
      if (register) {
        const fields = e instanceof ApiError ? e.fields : undefined;
        if (fields && Object.keys(fields).length) setErrors({ ...(fields.full_name ? { name: fields.full_name } : {}), ...(fields.email ? { email: fields.email } : {}), ...(fields.password ? { password: fields.password } : {}) });
        else if (e instanceof ApiError && e.message === 'Email này đã được đăng ký.') setErrors({ email: 'Email này đã được đăng ký.' });
        else setError(e instanceof Error ? e.message : 'Không thể hoàn tất. Vui lòng thử lại.');
      } else {
        const failure = classifyLoginError(e);
        if (failure.kind === 'locked' || failure.kind === 'ipLimited') { setNow(Date.now()); setLockUntil(Date.now() + failure.retryAfter * 1000); }
        setError(failure.kind === 'unknown' && e instanceof Error ? e.message : failure.message);
        setErrorKind(failure.kind);
      }
    }
    finally { submitting.current = false; setBusy(false); }
  };
  return <AuthLayout title={register ? 'Bắt đầu hành trình của bạn' : 'Chào mừng trở lại'} subtitle={register ? 'Tạo tài khoản để khám phá những câu chuyện ở mỗi điểm đến.' : 'Đăng nhập để tiếp tục khám phá cùng Multilingual Guide.'}>
    {!register && params.registered === '1' && <Text accessibilityRole="alert" style={{ color: C.primaryDark, backgroundColor: C.successSoft, padding: 14, borderRadius: 12, marginBottom: 18 }}>{t('Đăng ký thành công! Bạn có thể đăng nhập ngay.')}</Text>}
    {register && <AuthTextField label="Họ và tên" icon="person-outline" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" error={errors.name} editable={!busy && formReady} />}
    <AuthTextField label="Địa chỉ email" icon="mail-outline" value={email} onChangeText={value => {
      setEmail(value);
      setErrors(previous => previous.email ? { ...previous, email: validateGmail(value) } : previous);
    }} onBlur={() => setErrors(previous => ({ ...previous, email: validateGmail(email) }))} keyboardType="email-address" autoComplete="email" error={errors.email} editable={!busy && formReady} returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
    <AuthTextField label="Mật khẩu" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry autoComplete={register ? 'new-password' : 'current-password'} error={errors.password} editable={!busy && formReady} inputRef={passwordRef} returnKeyType={register ? 'next' : 'go'} onSubmitEditing={() => register ? confirmRef.current?.focus() : void submit()} />
    {register && <><PasswordStrength password={password} /><Text style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>{t('Mật khẩu cần 8–128 ký tự, có chữ thường, chữ hoa và chữ số.')}</Text><AuthTextField label="Xác nhận mật khẩu" icon="shield-checkmark-outline" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" error={errors.confirm} editable={!busy && formReady} inputRef={confirmRef} returnKeyType="go" onSubmitEditing={() => void submit()} /><LanguageSelector value={language} onChange={v => { if (!busy) chooseLanguage(v as Language); }} /></>}
    {!register && sessionExpired && !error && <Text accessibilityRole="alert" style={{ color: C.danger, backgroundColor: C.dangerSoft, padding: 14, borderRadius: 12, marginBottom: 16 }}>{t('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')}</Text>}
    {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: C.danger, backgroundColor: C.dangerSoft, padding: 14, borderRadius: 12, marginBottom: 16 }}>{t(error)}{locked && (errorKind === 'locked' || errorKind === 'ipLimited') ? ` ${formatCountdown(remaining)}` : ''}</Text>}
    {!!sessionNotice && <Text accessibilityRole="alert" style={{ color: C.danger }}>{t(sessionNotice)}</Text>}
    <PrimaryButton title={register ? 'Tạo tài khoản' : 'Đăng nhập'} loading={busy || !formReady} disabled={locked} onPress={() => void submit()} icon="arrow-forward" />
    <View style={{ marginTop: 24, alignItems: 'center', gap: 8 }}><Text style={{ color: C.muted }}>{t(register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?')}</Text><Link href={{ pathname: register ? '/login' : '/register', params: redirect ? { redirect } : {} }} replace style={{ color: C.primaryDark, fontWeight: '700', padding: 12 }}>{t(register ? 'Đăng nhập' : 'Đăng ký ngay')}</Link></View>
  </AuthLayout>;
}
