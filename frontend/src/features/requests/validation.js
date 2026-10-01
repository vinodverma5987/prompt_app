import { z } from 'zod';
export const languages = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
];
export const promptSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Enter a prompt to get started.')
    .max(4000, 'Keep your prompt under 4,000 characters.'),
  targetLanguage: z.enum(['en', 'es', 'fr', 'de']),
});
