import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Mermaid from './Mermaid';

export default function MarkdownRenderer({
  children,
  content,
  className = '',
  components = {},
  remarkPlugins = [],
  ...rest
}) {
  const markdownText = children !== undefined && children !== null ? children : (content || '');
  const customComponents = {
    pre({ node, children: preChildren, ...props }) {
      const childArray = React.Children.toArray(preChildren);
      const firstChild = childArray[0];

      // If the code block is a Mermaid graph, unwrap <pre> so Mermaid renders cleanly as a block
      if (
        firstChild &&
        React.isValidElement(firstChild) &&
        firstChild.props?.className &&
        typeof firstChild.props.className === 'string' &&
        firstChild.props.className.includes('language-mermaid')
      ) {
        return firstChild;
      }

      if (components.pre) {
        return components.pre({ node, children: preChildren, ...props });
      }

      return <pre {...props}>{preChildren}</pre>;
    },

    code({ node, inline, className: codeClassName, children: codeChildren, ...props }) {
      const match = /language-(\w+)/.exec(codeClassName || '');
      const isMermaid = match && match[1]?.toLowerCase() === 'mermaid';

      if (isMermaid) {
        const chartCode = String(codeChildren).replace(/\n$/, '');
        return <Mermaid chart={chartCode} />;
      }

      if (components.code) {
        return components.code({ node, inline, className: codeClassName, children: codeChildren, ...props });
      }

      return (
        <code className={codeClassName} {...props}>
          {codeChildren}
        </code>
      );
    },

    ...components
  };

  const plugins = [remarkGfm, ...remarkPlugins];

  return (
    <ReactMarkdown
      remarkPlugins={plugins}
      components={customComponents}
      className={className}
      {...rest}
    >
      {markdownText}
    </ReactMarkdown>
  );
}
