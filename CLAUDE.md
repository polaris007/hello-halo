**使用中文进行交流。** 所有对话、注释、文档均使用中文。

**No hardcoded text.** Use `t('English text')`.

```tsx
✓ <Button>{t('Save')}</Button>
✗ <Button>Save</Button>
```
No need to write translation files because the translation is automated.

Run `npm run i18n` before commit by user.