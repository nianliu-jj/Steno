## MODIFIED Requirements

### Requirement: Clipboard image history preview

The clipboard history MUST capture image clipboard entries as previewable image records and display them as image thumbnails in the clipboard view.

#### Scenario: Image clipboard entry is stored as a previewable data URL

- **WHEN** the system clipboard contains image pixel data
- **AND** the clipboard monitor records it
- **THEN** the resulting clipboard entry content type is `image`
- **AND** the content is a `data:image/` URL
- **AND** the preview is the localized image summary text

#### Scenario: Image clipboard entry is rendered as an image

- **WHEN** the clipboard view receives an entry with content type `image`
- **THEN** it renders an image element whose source is the entry content
- **AND** it does not render the entry through the text preview surface
