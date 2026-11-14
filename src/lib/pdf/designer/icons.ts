/**
 * Icons available in the template designer: Lucide (ISC licence) outlines on a
 * 24-unit grid, kept as plain shape data so the editor (SVG) and the PDF
 * renderer (@react-pdf Svg) draw the same thing.
 */
export type IconShape = readonly [tag: string, attrs: Readonly<Record<string, string>>];

export const DESIGNER_ICONS = {
  "phone": [
    [
      "path",
      {
        "d": "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"
      }
    ]
  ],
  "mail": [
    [
      "path",
      {
        "d": "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"
      }
    ],
    [
      "rect",
      {
        "x": "2",
        "y": "4",
        "width": "20",
        "height": "16",
        "rx": "2"
      }
    ]
  ],
  "globe": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"
      }
    ],
    [
      "path",
      {
        "d": "M2 12h20"
      }
    ]
  ],
  "map-pin": [
    [
      "path",
      {
        "d": "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
      }
    ],
    [
      "circle",
      {
        "cx": "12",
        "cy": "10",
        "r": "3"
      }
    ]
  ],
  "landmark": [
    [
      "path",
      {
        "d": "M10 18v-7"
      }
    ],
    [
      "path",
      {
        "d": "M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"
      }
    ],
    [
      "path",
      {
        "d": "M14 18v-7"
      }
    ],
    [
      "path",
      {
        "d": "M18 18v-7"
      }
    ],
    [
      "path",
      {
        "d": "M3 22h18"
      }
    ],
    [
      "path",
      {
        "d": "M6 18v-7"
      }
    ]
  ],
  "calendar": [
    [
      "path",
      {
        "d": "M8 2v3"
      }
    ],
    [
      "path",
      {
        "d": "M16 2v3"
      }
    ],
    [
      "rect",
      {
        "x": "3",
        "y": "3",
        "width": "18",
        "height": "18",
        "rx": "2"
      }
    ],
    [
      "path",
      {
        "d": "M3 9h18"
      }
    ]
  ],
  "clock": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "M12 6v6l4 2"
      }
    ]
  ],
  "user": [
    [
      "path",
      {
        "d": "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
      }
    ],
    [
      "circle",
      {
        "cx": "12",
        "cy": "7",
        "r": "4"
      }
    ]
  ],
  "building-2": [
    [
      "path",
      {
        "d": "M10 12h4"
      }
    ],
    [
      "path",
      {
        "d": "M10 8h4"
      }
    ],
    [
      "path",
      {
        "d": "M14 21v-3a2 2 0 0 0-4 0v3"
      }
    ],
    [
      "path",
      {
        "d": "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"
      }
    ],
    [
      "path",
      {
        "d": "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"
      }
    ]
  ],
  "credit-card": [
    [
      "rect",
      {
        "width": "20",
        "height": "14",
        "x": "2",
        "y": "5",
        "rx": "2"
      }
    ],
    [
      "line",
      {
        "x1": "2",
        "x2": "22",
        "y1": "10",
        "y2": "10"
      }
    ]
  ],
  "banknote": [
    [
      "rect",
      {
        "width": "20",
        "height": "12",
        "x": "2",
        "y": "6",
        "rx": "2"
      }
    ],
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "2"
      }
    ],
    [
      "path",
      {
        "d": "M6 12h.01M18 12h.01"
      }
    ]
  ],
  "receipt": [
    [
      "path",
      {
        "d": "M12 17V7"
      }
    ],
    [
      "path",
      {
        "d": "M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8"
      }
    ],
    [
      "path",
      {
        "d": "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"
      }
    ]
  ],
  "file-text": [
    [
      "path",
      {
        "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
      }
    ],
    [
      "path",
      {
        "d": "M14 2v5a1 1 0 0 0 1 1h5"
      }
    ],
    [
      "path",
      {
        "d": "M10 9H8"
      }
    ],
    [
      "path",
      {
        "d": "M16 13H8"
      }
    ],
    [
      "path",
      {
        "d": "M16 17H8"
      }
    ]
  ],
  "link": [
    [
      "path",
      {
        "d": "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
      }
    ],
    [
      "path",
      {
        "d": "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      }
    ]
  ],
  "star": [
    [
      "path",
      {
        "d": "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
      }
    ]
  ],
  "heart": [
    [
      "path",
      {
        "d": "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"
      }
    ]
  ],
  "check": [
    [
      "path",
      {
        "d": "M20 6 9 17l-5-5"
      }
    ]
  ],
  "circle-check": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "m9 12 2 2 4-4"
      }
    ]
  ],
  "info": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "M12 16v-4"
      }
    ],
    [
      "path",
      {
        "d": "M12 8h.01"
      }
    ]
  ],
  "briefcase": [
    [
      "path",
      {
        "d": "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"
      }
    ],
    [
      "rect",
      {
        "width": "20",
        "height": "14",
        "x": "2",
        "y": "6",
        "rx": "2"
      }
    ]
  ],
  "truck": [
    [
      "path",
      {
        "d": "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"
      }
    ],
    [
      "path",
      {
        "d": "M15 18H9"
      }
    ],
    [
      "path",
      {
        "d": "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"
      }
    ],
    [
      "circle",
      {
        "cx": "17",
        "cy": "18",
        "r": "2"
      }
    ],
    [
      "circle",
      {
        "cx": "7",
        "cy": "18",
        "r": "2"
      }
    ]
  ],
  "package": [
    [
      "path",
      {
        "d": "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"
      }
    ],
    [
      "path",
      {
        "d": "M12 22V12"
      }
    ],
    [
      "polyline",
      {
        "points": "3.29 7 12 12 20.71 7"
      }
    ],
    [
      "path",
      {
        "d": "m7.5 4.27 9 5.15"
      }
    ]
  ],
  "wrench": [
    [
      "path",
      {
        "d": "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"
      }
    ]
  ],
  "sparkles": [
    [
      "path",
      {
        "d": "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
      }
    ],
    [
      "path",
      {
        "d": "M20 2v4"
      }
    ],
    [
      "path",
      {
        "d": "M22 4h-4"
      }
    ],
    [
      "circle",
      {
        "cx": "4",
        "cy": "20",
        "r": "2"
      }
    ]
  ]
} as const satisfies Record<string, readonly IconShape[]>;

export type DesignerIconName = keyof typeof DESIGNER_ICONS;

export const DESIGNER_ICON_NAMES = Object.keys(DESIGNER_ICONS) as [DesignerIconName, ...DesignerIconName[]];

export const DESIGNER_ICON_LABELS: Record<DesignerIconName, string> = {
  "phone": "Phone",
  "mail": "Mail",
  "globe": "Globe",
  "map-pin": "Map pin",
  "landmark": "Landmark",
  "calendar": "Calendar",
  "clock": "Clock",
  "user": "User",
  "building-2": "Building",
  "credit-card": "Credit card",
  "banknote": "Banknote",
  "receipt": "Receipt",
  "file-text": "File text",
  "link": "Link",
  "star": "Star",
  "heart": "Heart",
  "check": "Check",
  "circle-check": "Circle check",
  "info": "Info",
  "briefcase": "Briefcase",
  "truck": "Truck",
  "package": "Package",
  "wrench": "Wrench",
  "sparkles": "Sparkles"
};
