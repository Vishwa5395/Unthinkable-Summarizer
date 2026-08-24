import React from 'react';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      num: '01',
      title: 'Upload',
      subtitle: 'Any Document, Any Format',
      description:
        'Drop PDF documents, scanned pages, smartphone photos, or handwritten field notes. Multi-file upload enables individual summaries or cross-document comparisons.',
      tag: 'PDF · PNG · JPG · WEBP',
    },
    {
      num: '02',
      title: 'We Understand',
      subtitle: 'Textual + Visual Comprehension',
      description:
        'Selective page rendering detects selectable text, runs optical recognition on scanned pages, extracts tabular grids, and isolates mathematical formulas.',
      tag: 'OCR · Tables · Formulas · Charts',
    },
    {
      num: '03',
      title: 'We Find What Matters',
      subtitle: 'Distilled Intelligence',
      description:
        'Generates Brief, Balanced, or Detailed executive summaries, numbered takeaways, key metrics (compensation, percentages, dates), and tailored suggestions.',
      tag: 'Takeaways · Numbers · Outline',
    },
    {
      num: '04',
      title: 'You Explore',
      subtitle: 'Continuous Document Reader',
      description:
        'Scroll vertically through all document pages with zero page-flipper friction. Click citations in the summary to instantly jump and highlight the exact source page.',
      tag: 'Continuous Scroll · Citations',
    },
    {
      num: '05',
      title: 'Ask Anything',
      subtitle: 'Contextual Document Q&A',
      description:
        'Query the document directly in the workspace. The assistant retrieves relevant passages and answers with precise citations, remaining strictly grounded in evidence.',
      tag: 'Grounded Q&A · Multi-Doc Search',
    },
  ];

  return (
    <section className="w-full max-w-5xl mx-auto px-3 sm:px-6 md:px-8 py-10 sm:py-16 border-t-2 border-ink-950 dark:border-ink-800 mt-8 sm:mt-12 transition-colors duration-150">
      {/* Section Header */}
      <div className="mb-8 sm:mb-12 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-3 sm:gap-4">
        <div>
          <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-ink-500 dark:text-ink-400">
            How It Works
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight uppercase text-ink-950 dark:text-ink-50 mt-1">
            Engineered for <span className="hand-drawn-underline">total accuracy</span>
          </h2>
        </div>
        <div className="text-xs font-mono text-ink-600 dark:text-ink-400 max-w-sm">
          Deterministic extraction guaranteed offline, elevated with multimodal structured analysis.
        </div>
      </div>

      {/* Step Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {steps.map((step) => (
          <div
            key={step.num}
            className="p-4 sm:p-6 bg-paper-light dark:bg-paper-darkcard border-1.5 border-ink-950 dark:border-ink-700 shadow-brutal dark:shadow-brutal-dark flex flex-col justify-between transition-colors duration-150"
          >
            <div>
              <div className="flex items-center justify-between mb-2.5 sm:mb-3">
                <span className="font-mono font-bold text-xl sm:text-2xl text-ink-950 dark:text-ink-100">
                  {step.num}
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono uppercase px-2 py-0.5 border border-ink-950 dark:border-ink-600 bg-paper-warm dark:bg-paper-darkmuted text-ink-800 dark:text-ink-200">
                  {step.tag}
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
                {step.title}
              </h3>
              <div className="text-xs font-mono text-ink-600 dark:text-ink-400 mb-2.5 sm:mb-3">
                {step.subtitle}
              </div>

              <p className="text-xs font-mono text-ink-700 dark:text-ink-300 leading-relaxed">
                {step.description}
              </p>
            </div>

            <div className="mt-4 sm:mt-6 pt-3 border-t border-ink-200 dark:border-ink-800 text-[10px] font-mono text-ink-500 dark:text-ink-400 uppercase tracking-widest">
              Unthinkable Pipeline
            </div>
          </div>
        ))}

        {/* Bonus Architecture Card */}
        <div className="p-4 sm:p-6 bg-ink-950 dark:bg-ink-900 text-paper-light border-1.5 border-ink-950 dark:border-ink-600 shadow-brutal dark:shadow-brutal-dark flex flex-col justify-between transition-colors duration-150">
          <div>
            <div className="flex items-center justify-between mb-2.5 sm:mb-3">
              <span className="font-mono font-bold text-xl sm:text-2xl text-paper-light">
                ∞
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono uppercase px-2 py-0.5 border border-paper-light dark:border-ink-500 bg-ink-900 dark:bg-ink-950 text-paper-light">
                RELIABILITY FIRST
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-bold uppercase tracking-tight text-paper-light">
              Zero Failure Guarantee
            </h3>
            <div className="text-xs font-mono text-ink-400 mb-2.5 sm:mb-3">
              Hybrid Intelligence Fallback
            </div>

            <p className="text-xs font-mono text-ink-300 leading-relaxed">
              If an external AI provider encounters rate limits or downtime, Unthinkable automatically activates its local deterministic NLP engine so your documents are always understood.
            </p>
          </div>

          <div className="mt-4 sm:mt-6 pt-3 border-t border-ink-800 text-[10px] font-mono text-ink-400 uppercase tracking-widest">
            Always Available
          </div>
        </div>
      </div>
    </section>
  );
};
