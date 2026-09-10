CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`doctor_id` integer NOT NULL,
	`department_id` integer,
	`scheduled_at` integer NOT NULL,
	`duration_minutes` integer DEFAULT 30 NOT NULL,
	`reason` text,
	`status` text DEFAULT 'booked' NOT NULL,
	`checked_in_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visit_note_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_url` text NOT NULL,
	`uploaded_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`visit_note_id`) REFERENCES `visit_notes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`before_json` text,
	`after_json` text,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `care_plan_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`source_visit_note_id` integer,
	`description` text NOT NULL,
	`due_at` integer,
	`priority` text DEFAULT 'normal' NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`completed_by` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_visit_note_id`) REFERENCES `visit_notes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `department_staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`department_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`assigned_at` integer NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`type` text NOT NULL,
	`bed_capacity` integer DEFAULT 0 NOT NULL,
	`min_clinicians_per_shift` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);--> statement-breakpoint
CREATE TABLE `doctor_availability` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doctor_id` integer NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`department_id` integer,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `doctor_blocked_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doctor_id` integer NOT NULL,
	`blocked_date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`reason` text,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `insurance_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`payer_name` text NOT NULL,
	`claim_number` text,
	`status` text DEFAULT 'none' NOT NULL,
	`denial_reason` text,
	`appeal_deadline` integer,
	`submitted_at` integer,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invoice_line_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_amount` real DEFAULT 0 NOT NULL,
	`item_type` text NOT NULL,
	`department_id` integer,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`visit_note_id` integer,
	`payer_name` text,
	`total_amount` real DEFAULT 0 NOT NULL,
	`amount_paid` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_note_id`) REFERENCES `visit_notes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `patient_allergies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`substance` text NOT NULL,
	`severity` text NOT NULL,
	`noted_by` integer,
	`noted_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`noted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `patient_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`nurse_id` integer NOT NULL,
	`bed_label` text,
	`shift_date` text NOT NULL,
	`shift_window` text,
	`assigned_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`nurse_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `patient_dedup_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`matched_patient_id` integer,
	`match_type` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`overridden_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matched_patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`overridden_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mrn` text NOT NULL,
	`full_name` text NOT NULL,
	`dob` integer,
	`sex` text,
	`national_id` text,
	`phone` text,
	`address` text,
	`emergency_contact_name` text,
	`emergency_contact_phone` text,
	`acuity` text DEFAULT 'routine' NOT NULL,
	`status` text DEFAULT 'outpatient' NOT NULL,
	`primary_department_id` integer,
	`payer_name` text,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`primary_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patients_mrn_unique` ON `patients` (`mrn`);--> statement-breakpoint
CREATE UNIQUE INDEX `patients_national_id_unique` ON `patients` (`national_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`amount` real NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`paid_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `permission_matrix` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL,
	`module` text NOT NULL,
	`can_view` integer DEFAULT false NOT NULL,
	`can_create` integer DEFAULT false NOT NULL,
	`can_edit` integer DEFAULT false NOT NULL,
	`can_delete` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permission_matrix_role_module_unique` ON `permission_matrix` (`role`,`module`);--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visit_note_id` integer NOT NULL,
	`medication` text NOT NULL,
	`dosage` text,
	`frequency` text,
	`duration_days` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`visit_note_id`) REFERENCES `visit_notes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `user_widget_layout` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`widget_id` integer NOT NULL,
	`position_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`size` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`widget_id`) REFERENCES `widget_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text DEFAULT 'receptionist' NOT NULL,
	`department_id` integer,
	`specialisation` text,
	`status` text DEFAULT 'active' NOT NULL,
	`mfa_enabled` integer DEFAULT false NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `visit_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`appointment_id` integer,
	`patient_id` integer NOT NULL,
	`doctor_id` integer NOT NULL,
	`chief_complaint` text,
	`diagnosis` text,
	`clinical_notes` text,
	`department_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`signed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vitals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`appointment_id` integer,
	`systolic` integer,
	`diastolic` integer,
	`heart_rate` integer,
	`spo2` integer,
	`temperature_c` real,
	`respiratory_rate` integer,
	`note` text,
	`recorded_by` integer,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `widget_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`default_role` text,
	`globally_enabled` integer DEFAULT true NOT NULL,
	`globally_locked` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `widget_definitions_key_unique` ON `widget_definitions` (`key`);