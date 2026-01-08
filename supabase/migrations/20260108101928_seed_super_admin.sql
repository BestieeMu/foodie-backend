-- SQL to create the Default Super Admin
-- Email: chideraigboka7@gmail.com
-- Password: superadmin123
INSERT INTO users (id, email, password, name, role, created_at)
VALUES (
  'u_chidera_super', 
  'chideraigboka7@gmail.com', 
  '$2a$10$s1Cu8LOcZJHBmfi8DfR/m.K0s4BtpkZWtQTTDblpYuefEiRHiSoG.', 
  'Chidera Super Admin', 
  'super_admin', 
  NOW()
)
ON CONFLICT (email) DO NOTHING;
