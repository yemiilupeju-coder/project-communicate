# Product Requirements Document
## Next-Generation AAC Communication Platform
**Working title:** Project Communicate  
**Document type:** MVP Product Requirements & School Pilot Proposal  
**Version:** 1.0  
**Date:** November 9, 2026  
**Initial market:** Alberta, Canada  
**Target platforms:** Apple iPad and Android tablets

---

# 1. Executive Summary

Project Communicate is a next-generation Augmentative and Alternative Communication (AAC) platform designed to help individuals with complex communication needs express themselves more independently.

The platform will provide an accessible, customizable communication experience across Apple and Android tablets, supported by intelligent personalization, caregiver and educator collaboration, and optional AI-powered assistance.

Unlike traditional AAC applications that primarily focus on preconfigured communication boards, Project Communicate will be designed as an evolving communication ecosystem connecting students, families, educators, and speech-language pathologists.

The MVP will prioritize five outcomes:

1. Reliable communication through customizable picture and word-based boards.
2. Consistent communication experiences across Android and Apple tablets.
3. Simple vocabulary and communication-board customization.
4. Secure sharing and backup of communication configurations.
5. AI-assisted personalization that supports educators and caregivers without taking control away from the communicator.

**Core product principle:** The individual using the communication system must remain in control of what they communicate.

# 2. Problem Statement

People who experience difficulty communicating verbally may rely on AAC devices and applications to express their thoughts, needs, preferences, questions, and feelings.

Existing solutions can create challenges for families and educational institutions:

- Communication configurations can be difficult for educators and caregivers to maintain.
- Personalization may require specialized knowledge or considerable time.
- Different devices and platforms can create compatibility limitations.
- Vocabulary may not adequately reflect an individual's personal environment, culture, language, or interests.
- Communication configurations may not transfer easily between home, school, and therapy environments.
- Families and educators may lack a convenient way to collaborate on communication development.
- Traditional interfaces can be intimidating for new users and administrators.

Project Communicate aims to address these challenges through an accessible, cross-platform, and collaboration-oriented AAC experience.

# 3. Product Vision

Build a communication platform that grows with the individual.

The platform should support:
- Communication of immediate needs.
- Social interaction and relationship building.
- Education and classroom participation.
- Expression of opinions, ideas, and emotions.
- Personal storytelling.
- Language development.
- Communication across different environments.

The long-term ambition is to make communication configurations portable, personalized, and collaborative.

# 4. Target Users

## Primary users

**A. AAC communicators**

Individuals who use picture-based, symbol-based, or text-based communication.

Potential users include individuals with:
- Autism.
- Down syndrome.
- Cerebral palsy.
- Aphasia.
- Speech and language disorders.
- Other conditions affecting verbal communication.

The product must not assume that every person within a diagnostic category has the same communication needs.

## Secondary users

**B. Parents and caregivers**

People responsible for supporting communication at home and in daily life.

**C. Teachers and educational assistants**

School personnel supporting students who use AAC.

**D. Speech-language pathologists**

Professionals who assess communication needs and support vocabulary and AAC configuration.

**E. School administrators**

Individuals responsible for approving, deploying, and managing educational technology.

# 5. MVP Product Scope

The MVP will consist of four primary components:

1. AAC Communicator Application.
2. Communication Board Builder.
3. Secure Configuration Management.
4. AI Personalization Assistant.

The first release must be usable without AI or an internet connection.

## 5.1 AAC Communicator Application

The communicator is the central interface used by the individual.

### Functional requirements

**FR-001: Communication board**

The application must display customizable communication buttons arranged in a grid.

Each button must support:
- Image or symbol.
- Text label.
- Optional spoken audio.
- Configurable background and foreground presentation.
- Customizable size and placement.
- Optional category or folder assignment.

**FR-002: Speech generation**

When a user selects a communication button, the application must speak the associated word or phrase.

The application must support:
- Native Android text-to-speech.
- Native Apple text-to-speech.
- Configurable voice selection where supported.
- Adjustable speech rate and volume.
- Immediate speech playback.
- A visible stop-speech control.

**FR-003: Sentence construction**

Users must be able to select multiple words and build a sentence.

The application must provide:
- A persistent sentence bar.
- Word removal and editing.
- Clear sentence functionality.
- A speak-entire-sentence action.
- Optional individual word playback.

**FR-004: Navigation**

Users must be able to navigate between communication categories and boards.

Examples:
- Home.
- People.
- Food.
- Drinks.
- Feelings.
- Activities.
- Places.
- Questions.
- Social interaction.
- Classroom vocabulary.

Navigation must be predictable and consistent.

**FR-005: Communication history**

The application should provide a configurable history of recently selected words and phrases.

Users must be able to repeat previously communicated messages.

History must be optional and should not become an unnecessary record of sensitive student behaviour.

**FR-006: Offline operation**

Core communication must function without internet connectivity.

This includes:
- Opening communication boards.
- Selecting vocabulary.
- Building sentences.
- Speaking messages using available local speech resources.
- Navigating categories.
- Accessing locally stored images and symbols.

Internet connectivity must never be required for basic communication.

**FR-007: Personalization**

Users must be able to personalize:
- Button size.
- Grid layout.
- Text visibility.
- Image visibility.
- Colour presentation.
- Speech settings.
- Navigation preferences.

**FR-008: Accessibility**

The application must support:
- Large touch targets.
- Adjustable grid density.
- High-contrast presentation.
- Clear typography.
- Reduced visual distractions.
- Consistent button positioning.
- Switch-access compatibility where supported by the operating system.
- Screen-reader compatibility for administrative interfaces.
- Appropriate feedback for button selection.

The application must not rely exclusively on colour, audio, or visual information to communicate an interface state.

# 6. Communication Board Builder

The Board Builder will allow authorized adults to customize communication experiences without requiring programming knowledge.

### Functional requirements

**FR-009: Create boards**

Authorized users must be able to create new communication boards.

**FR-010: Edit boards**

Users must be able to:
- Add buttons.
- Remove buttons.
- Edit labels.
- Change associated images.
- Change spoken phrases.
- Rearrange button positions.
- Change grid dimensions.
- Create categories and subcategories.

**FR-011: Image library**

The application must provide a starter library of communication symbols and images.

Users must also be able to upload their own images.

Image sources must have appropriate licensing and permissions.

**FR-012: Custom photographs**

Authorized users must be able to associate personal photographs with communication buttons.

Examples include:
- Family members.
- Teachers.
- Friends.
- Familiar locations.
- Personal belongings.
- Favourite activities.

**FR-013: Duplicate and reuse boards**

Users must be able to duplicate an existing board and modify the copy without affecting the original.

**FR-014: Vocabulary organization**

Vocabulary should support:
- Categories.
- Subcategories.
- Individual words.
- Multiword phrases.
- Questions.
- Social expressions.
- Personalized vocabulary.

**FR-015: Board import and export**

Users must be able to export and import communication configurations through a secure, documented file format.

The format must preserve:
- Board structure.
- Button positions.
- Vocabulary.
- Images where permitted.
- Speech settings.
- User preferences.

The export format must not silently include unnecessary student personal information.

# 7. AI Personalization Assistant

AI is a differentiating capability, but it must be introduced carefully.

The AI assistant is primarily an administrative tool for parents, teachers, and communication professionals.

It must not independently determine what a communicator intends to say.

### Functional requirements

**FR-016: Vocabulary suggestions**

An authorized adult may describe a communication context.

Example:

"We need vocabulary for a student participating in a school field trip."

The assistant may suggest relevant vocabulary, including:
- Bus.
- Teacher.
- Friend.
- Bathroom.
- Lunch.
- Help.
- Stop.
- I need a break.
- I like this.
- I don't like this.

Suggestions must be reviewed and approved by an authorized adult before being added.

**FR-017: Context-specific board suggestions**

The assistant may propose boards for:
- Classroom participation.
- Mealtime.
- Playground activities.
- School transportation.
- Community outings.
- Personal care.
- Social interaction.

**FR-018: Phrase suggestions**

The assistant may suggest additional phrases based on an existing vocabulary configuration.

For example, when a board contains "I", "want", and "help", the assistant could suggest:
- I need help.
- Can you help me?
- I don't understand.

**FR-019: Multilingual support**

The assistant should eventually help create multilingual vocabulary configurations.

The MVP may support a limited selection of languages, subject to availability and testing of appropriate speech voices.

Translations must be reviewable by a qualified human.

**FR-020: AI approval workflow**

Every AI-generated suggestion must be presented for review.

No AI-generated vocabulary, phrase, or configuration may automatically replace an existing communication board.

**FR-021: Privacy controls**

The MVP must not send identifiable student information, personal photographs, diagnoses, or private communication history to an external AI service.

AI functionality should initially operate using adult-provided, non-identifying context.

AI must be disabled by default until the school or authorized administrator enables it.

# 8. Secure Configuration Management

The platform should make communication configurations portable between authorized environments.

### Functional requirements

**FR-022: User profiles**

Authorized adults must be able to create a local communicator profile.

Profiles should support:
- Display name or pseudonym.
- Communication preferences.
- Board configuration.
- Voice preferences.
- Accessibility preferences.

A diagnosis must not be required to create a profile.

**FR-023: Configuration backup**

Users must be able to create backups of communication configurations.

**FR-024: Configuration sharing**

Authorized users must be able to export a configuration and share it with another authorized caregiver, educator, or professional.

The recipient must explicitly import the configuration.

**FR-025: Configuration versioning**

The application should maintain a version identifier for each configuration.

Users must be able to identify and restore a previous configuration.

**FR-026: Access management**

The application must distinguish between:
- Communicator.
- Parent/caregiver.
- Educator.
- Administrator.

Permissions must prevent unauthorized changes to configurations.

**FR-027: Cloud readiness**

The architecture should support future secure cloud synchronization between authorized devices.

Full multi-user cloud collaboration is not a launch dependency.

# 9. User Experience Requirements

The interface must be designed for simplicity, consistency, and accessibility.

### Communicator experience

A user should be able to:

1. Open the application.
2. Access their communication board.
3. Select a word or phrase.
4. Hear the corresponding spoken message.
5. Combine words into a sentence.
6. Navigate to another category.
7. Return to the home board.

The core experience should require minimal steps.

### Educator experience

An educator should be able to:

1. Open the Board Builder.
2. Select an existing communicator configuration.
3. Add or modify vocabulary.
4. Preview the communication board.
5. Save the updated configuration.
6. Export or share the configuration.

The educator should not need coding skills.

# 10. Platform and Technical Requirements

### Mobile application

Recommended technology: Flutter.

The application should use a shared codebase for:
- iPadOS.
- Android tablets.

The application must be tested on representative devices from both ecosystems.

### Recommended architecture

| Component | Proposed technology |
|---|---|
| Mobile application | Flutter |
| Local database | SQLite |
| Local file storage | Secure platform storage |
| Backend API | .NET / ASP.NET Core |
| Cloud database | PostgreSQL or Azure SQL |
| Authentication | Microsoft Entra External ID or equivalent |
| Cloud infrastructure | Microsoft Azure |
| AI integration | Azure-hosted AI service |
| Application monitoring | Privacy-conscious application telemetry |

The architecture must support offline-first functionality.

### Technical requirements

**TR-001:** Core communication must work without an active network connection.

**TR-002:** Local configuration changes must persist after closing and reopening the application.

**TR-003:** The application must recover gracefully after unexpected termination.

**TR-004:** Communication buttons must respond promptly, with a target of under 100 milliseconds for local selection feedback.

**TR-005:** Speech playback must begin promptly, with a target of under 500 milliseconds after selection when local speech resources are available.

**TR-006:** The application must support different tablet screen sizes and orientations.

**TR-007:** The application must not require a continuous account login to access an already configured local communication board.

**TR-008:** Configuration exports must use a documented, versioned format.

**TR-009:** Data must be encrypted in transit and sensitive stored information protected using appropriate platform security controls.

**TR-010:** The application must support application updates without intentionally overwriting existing communication configurations.

# 11. Privacy, Security, and Safeguarding

Because the product is intended for schools and may be used by children and other vulnerable individuals, privacy and safeguarding must be foundational requirements.

### Required safeguards

- Collect only information necessary to operate the platform.
- Do not sell student information.
- Do not use student information for advertising.
- Do not train AI models on student information.
- Do not expose communication history to unauthorized users.
- Provide secure authentication for administrative functions.
- Provide role-based access controls.
- Provide a documented data deletion process.
- Provide a documented privacy incident response process.
- Use encryption in transit and at rest where data is stored.
- Avoid collecting precise location information.
- Do not include third-party advertising or behavioural tracking.

### School deployment requirements

Before a school uses the product with identifiable student information, the vendor must provide:

1. Privacy policy.
2. Data processing and service agreement.
3. Data inventory and information-flow diagram.
4. Security architecture overview.
5. Data retention and deletion policy.
6. Subprocessor and hosting-location disclosure.
7. Privacy impact assessment support documentation.
8. AI functionality and data-use disclosure.
9. Incident response and notification procedure.
10. Accessibility statement.

For Alberta public schools, privacy requirements must be reviewed against the Protection of Privacy Act (POPA), applicable regulations, and the school authority's own policies.

The school authority must determine its legal authority and approval requirements for the proposed use. Vendor consent forms alone do not establish that a school may collect or use student information.

# 12. Performance and Reliability Requirements

The application must prioritize dependable communication.

| Requirement | MVP target |
|---|---|
| Offline communication | Fully supported |
| Application startup | Under 3 seconds on supported devices |
| Button response | Under 100 ms |
| Local speech initiation | Under 500 ms where supported |
| Configuration persistence | No loss during normal operation |
| Crash recovery | Restore last saved configuration |
| Cloud dependency | None for core communication |
| Data synchronization | Not required for initial pilot |

Targets must be verified on the actual supported device list.

# 13. MVP Acceptance Criteria

The MVP will be considered ready for a controlled school pilot when all of the following are demonstrated.

### Communication

- A communicator can open a board and select vocabulary.
- Every configured button speaks its assigned word or phrase.
- A communicator can construct and speak a sentence.
- A communicator can navigate between at least five categories.
- The application operates without internet connectivity.

### Customization

- An authorized adult can create and edit a board.
- An authorized adult can add images and custom vocabulary.
- An authorized adult can rearrange buttons.
- A configuration can be exported and imported.
- Existing configurations remain intact after application restart.

### AI

- An authorized adult can request vocabulary suggestions.
- Suggestions can be reviewed and rejected.
- Approved suggestions can be added to a board.
- AI can be disabled.
- No identifiable student data is transmitted to the AI service.

### Security

- Administrative access is protected.
- User permissions are enforced.
- Configuration files do not expose unnecessary personal information.
- Data deletion and backup procedures are documented.
- School privacy documentation is available for review.

### Cross-platform

- Core features work on a supported iPad.
- Core features work on a supported Android tablet.
- Communication configurations can be transferred between the two platforms.

# 14. Explicitly Out of Scope for MVP

To prevent scope expansion, the following features are deferred.

- Eye-tracking hardware integration.
- Advanced predictive sentence completion.
- AI-generated responses during live communication.
- AI interpretation of facial expressions or behaviour.
- Automated assessment of communication ability.
- Clinical diagnosis or treatment recommendations.
- Full therapist scheduling and case-management software.
- School information system integrations.
- District-wide user provisioning.
- Advanced analytics and student performance scoring.
- Real-time multi-user editing.
- Automated communication recommendations based on student surveillance.
- Wearable device integration.

These may be considered after the initial pilot and appropriate consultation.

# 15. Proposed Development Milestones

The following is a proposed sequence, not a promise of delivery dates.

| Milestone | Deliverable |
|---|---|
| 1. Discovery | School, caregiver, AAC-user, and SLP feedback |
| 2. UX prototype | Communicator and Board Builder designs |
| 3. Core application | Flutter application and local storage |
| 4. Communication engine | Boards, speech, and sentence construction |
| 5. Board Builder | Vocabulary and configuration management |
| 6. AI assistant | Adult-facing vocabulary suggestions |
| 7. Cross-platform QA | iPad and Android testing |
| 8. Pilot preparation | Privacy, security, accessibility, and training documentation |
| 9. School pilot | Controlled evaluation and feedback |

# 16. School Pilot Proposal

We are seeking a small number of schools and educational professionals to participate in the product discovery and pilot process.

### Proposed participants

- 2–3 schools.
- 3–5 educators or educational assistants.
- 1–2 speech-language pathologists.
- Parents or caregivers.
- AAC users who wish to participate, with appropriate safeguards and support.

### Pilot objectives

1. Determine whether the communication interface is intuitive.
2. Evaluate the ease of customizing communication boards.
3. Test Android and Apple tablet compatibility.
4. Assess offline communication reliability.
5. Evaluate the usefulness of AI-assisted vocabulary suggestions.
6. Identify accessibility requirements.
7. Understand school procurement and privacy approval requirements.

### Pilot activities

- Demonstration of the application.
- Review of the communicator interface.
- Board customization exercise.
- Cross-device configuration transfer.
- Feedback interviews.
- Accessibility review.
- Identification of missing features.

### Pilot success measures

- Users can successfully complete core communication tasks.
- Educators can customize a board without developer assistance.
- Configurations can be transferred between supported devices.
- Core communication remains functional offline.
- Participants report that the interface is understandable and usable.
- No unresolved critical privacy or security issues remain.

The pilot is intended to evaluate usability and product suitability. It is not a clinical efficacy study and does not replace an individual's existing AAC system.

# 17. Product Principles

The following principles will guide every product decision.

**1. Communication before technology.** The product must never make communication harder in the pursuit of sophisticated features.

**2. Individual autonomy.** The communicator must remain in control of their message.

**3. Consistency matters.** Vocabulary placement and navigation should remain predictable unless an authorized person changes them.

**4. Offline first.** Communication must not depend on cloud availability.

**5. Human-guided AI.** AI may suggest, organize, and simplify. It must not decide what someone means.

**6. Inclusive design.** People with different communication, sensory, motor, and cognitive needs must be considered from the beginning.

**7. Collaboration without unnecessary complexity.** Families, schools, and professionals should be able to work together without creating administrative burdens.

# 18. Questions for School Partners

We would appreciate feedback on the following:

1. Which AAC applications are currently used within your school or division?
2. What are the biggest challenges educators and families experience with existing AAC applications?
3. Are Android tablets currently used for AAC, or are iPads the preferred device?
4. How are communication boards currently created and maintained?
5. What makes it difficult to keep communication vocabulary consistent between home and school?
6. Would an educator-facing AI vocabulary assistant be useful?
7. What privacy, accessibility, and procurement requirements would need to be satisfied before a pilot?
8. Would your school be interested in participating in an early product evaluation?

# 19. Requested Next Step

We are seeking an introductory meeting with school leaders, special education teams, speech-language pathologists, and assistive-technology professionals.

The objective is to validate the requirements, understand existing challenges, and identify potential pilot partners.

**Our goal is not simply to build another AAC application. It is to build a more connected, accessible, and adaptable communication platform that empowers individuals to express themselves across the environments in which they live, learn, and interact.**