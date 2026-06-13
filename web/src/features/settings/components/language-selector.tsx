import { useTranslation } from "react-i18next";

import { supportedLanguages } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

export function LanguageSelector() {
  const { i18n } = useTranslation();

  const items = supportedLanguages.map((lang) => ({
    value: lang.code,
    label: lang.name,
  }));

  // i18n.language can include a region (e.g. "en-US"); match on the base code.
  const current = supportedLanguages.find((lang) => i18n.language.startsWith(lang.code))?.code ?? "en";

  return (
    <Select
      items={items}
      value={current}
      onValueChange={(value) => {
        if (value) i18n.changeLanguage(value);
      }}
    >
      <SelectTrigger className="max-w-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
