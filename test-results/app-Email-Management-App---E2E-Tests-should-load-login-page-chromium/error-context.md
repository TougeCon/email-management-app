# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - heading "Email Manager" [level=3] [ref=e5]
      - paragraph [ref=e6]: Enter your password to access your email accounts
    - generic [ref=e8]:
      - generic [ref=e9]:
        - text: Password
        - textbox "Password" [ref=e10]:
          - /placeholder: Enter your password
      - button "Login" [ref=e11] [cursor=pointer]
  - region "Notifications (F8)":
    - list
  - alert [ref=e12]
```