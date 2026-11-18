import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '../../theme/colors';
import { useI18n } from '../../hooks/useI18n';
import { passwordIssues } from '../../services/authValidation';

interface PasswordStrengthProps {
  password: string;
}

function getStrength(password: string) {
  const issues = passwordIssues(password).length;
  if (issues > 0) return Math.min(2, 4 - issues);
  return password.length >= 12 || /[^A-Za-z0-9]/.test(password) ? 4 : 3;
}

const LABELS = ['Yếu', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'];
const COLORS = [C.danger, C.danger, C.gold, C.primary, C.success];

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const { t } = useI18n();
  const score = useMemo(() => getStrength(password), [password]);

  if (!password) return null;

  const color = COLORS[score];
  const label = LABELS[score];

  return (
    <View style={styles.container}>
      <View style={styles.barRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { backgroundColor: i < score ? color : C.border },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color }]}>{t(label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -10,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  barRow: { flexDirection: 'row', gap: 4, flex: 1 },
  bar: { height: 4, flex: 1, borderRadius: 2 },
  label: { fontSize: 11, fontWeight: '700', minWidth: 60 },
});
