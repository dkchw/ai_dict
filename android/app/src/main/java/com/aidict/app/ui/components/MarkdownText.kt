package com.aidict.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.foundation.text.selection.SelectionContainer
import com.halilibo.richtext.commonmark.Markdown
import com.halilibo.richtext.ui.BlockQuoteGutter
import com.halilibo.richtext.ui.CodeBlockStyle
import com.halilibo.richtext.ui.RichTextStyle
import com.halilibo.richtext.ui.material3.RichText
import com.halilibo.richtext.ui.string.RichTextStringStyle

@Composable
fun MarkdownText(text: String, color: Color, modifier: Modifier = Modifier, searchQuery: String = "") {
    // Tokyo-Night Inspired Markdown Theme
    val tokyoNightStyle = RichTextStyle(
        codeBlockStyle = CodeBlockStyle(
            modifier = Modifier
                .background(Color(0xFF1A1B26), shape = RoundedCornerShape(8.dp))
                .padding(16.dp),
            textStyle = TextStyle(
                fontFamily = FontFamily.Monospace,
                color = Color(0xFFA9B1D6),
                fontSize = 14.sp
            )
        ),
        blockQuoteGutter = BlockQuoteGutter.BarGutter(
            startMargin = 8.sp,
            barWidth = 4.sp,
            endMargin = 8.sp,
            color = { Color(0xFF7AA2F7) }
        ),
        headingStyle = { level, textStyle ->
            when (level) {
                0 -> textStyle.copy(color = Color(0xFFBB9AF7), fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) // H1 - Purple
                1 -> textStyle.copy(color = Color(0xFF7DCFFF), fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) // H2 - Cyan
                2 -> textStyle.copy(color = Color(0xFF7AA2F7), fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) // H3 - Blue
                3 -> textStyle.copy(color = Color(0xFFE0AF68), fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) // H4 - Orange
                4 -> textStyle.copy(color = Color(0xFFF7768E), fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) // H5 - Red
                5 -> textStyle.copy(color = Color(0xFF9ECE6A), fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) // H6 - Green
                else -> textStyle.copy(color = Color(0xFFC0CAF5), fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
            }
        },
        stringStyle = RichTextStringStyle(
            codeStyle = SpanStyle(
                fontFamily = FontFamily.Monospace,
                color = Color(0xFFBB9AF7),
                background = Color(0xFF16161E)
            )
        )
    )

    SelectionContainer(modifier = modifier) {
        if (searchQuery.isNotBlank()) {
            val annotatedString = buildAnnotatedString {
                append(text)
                var index = text.indexOf(searchQuery, ignoreCase = true)
                while (index >= 0) {
                    addStyle(
                        style = SpanStyle(background = Color.Yellow, color = Color.Black),
                        start = index,
                        end = index + searchQuery.length
                    )
                    index = text.indexOf(searchQuery, startIndex = index + searchQuery.length, ignoreCase = true)
                }
            }
            androidx.compose.material3.Text(
                text = annotatedString,
                color = color
            )
        } else {
            RichText(
                style = tokyoNightStyle
            ) {
                Markdown(content = text)
            }
        }
    }
}
