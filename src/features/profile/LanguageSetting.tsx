import { IonItem, IonList, IonSelect, IonSelectOption, useIonToast } from '@ionic/react';
import { useQueryClient } from '@tanstack/react-query';

import { LANGUAGE_NAMES, setLanguage, useT, type Language } from '../../i18n/i18n';
import { supabase } from '../../lib/supabase';
import { profileKey } from '../auth/api';
import type { Profile } from '../auth/roles';

/** Me page: app language (English / ಕನ್ನಡ), saved to the account so it follows the person. */
export function LanguageSetting({ profile }: { profile: Profile }) {
  const t = useT();
  const qc = useQueryClient();
  const [toast] = useIonToast();
  const current = (profile.language as Language) || 'en';

  async function change(lang: Language) {
    if (lang === current) return;
    setLanguage(lang);
    const { error } = await supabase
      .from('profiles')
      .update({ language: lang })
      .eq('id', profile.id);
    if (error) {
      void toast({
        message: t('Could not save'),
        duration: 2500,
        color: 'danger',
        position: 'top',
      });
      return;
    }
    await qc.invalidateQueries({ queryKey: profileKey(profile.id) });
  }

  return (
    <IonList inset style={{ margin: '24px 0 0' }}>
      <IonItem>
        <IonSelect
          label={t('Language')}
          interface="action-sheet"
          interfaceOptions={{ header: t('Language') }}
          value={current}
          onIonChange={(e) => void change(e.detail.value as Language)}
        >
          {(Object.keys(LANGUAGE_NAMES) as Language[]).map((l) => (
            <IonSelectOption key={l} value={l}>
              {LANGUAGE_NAMES[l]}
            </IonSelectOption>
          ))}
        </IonSelect>
      </IonItem>
    </IonList>
  );
}
