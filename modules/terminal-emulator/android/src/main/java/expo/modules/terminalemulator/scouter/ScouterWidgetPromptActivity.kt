package expo.modules.terminalemulator.scouter

import android.app.Activity
import android.app.AlertDialog
import android.os.Bundle
import android.text.InputType
import android.view.inputmethod.InputMethodManager
import android.content.Context
import android.widget.EditText
import android.widget.Toast
import expo.modules.terminalemulator.R
import expo.modules.terminalemulator.ShellyTerminalSession
import expo.modules.terminalemulator.TerminalSessionService

class ScouterWidgetPromptActivity : Activity() {
    private lateinit var input: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        input = EditText(this).apply {
            hint = getString(R.string.scouter_widget_prompt_hint)
            minLines = 2
            maxLines = 5
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            setSingleLine(false)
            setSelectAllOnFocus(false)
        }

        val dialog = AlertDialog.Builder(this)
            .setTitle(R.string.scouter_widget_prompt_title)
            .setView(input)
            .setNegativeButton(R.string.scouter_widget_prompt_cancel) { _, _ -> finish() }
            .setPositiveButton(R.string.scouter_widget_prompt_send, null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val prompt = input.text?.toString().orEmpty().trim()
                if (prompt.isBlank()) {
                    Toast.makeText(this, R.string.scouter_widget_prompt_empty, Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                sendPrompt(prompt)
                dialog.dismiss()
                finish()
            }
            input.requestFocus()
            dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
        }
        dialog.setOnCancelListener { finish() }
        dialog.show()
    }

    private fun sendPrompt(prompt: String) {
        val store = ScouterStateStore(this)
        val target = findBoundReadyCodexTerminal(store)
        if (target !is WidgetCodexTarget.Ready) {
            val messageId = target.messageResId()
            store.recordWidgetPromptFailed(getString(messageId))
            ScouterWidgetProvider.updateAll(this, force = true)
            Toast.makeText(this, messageId, Toast.LENGTH_SHORT).show()
            return
        }

        runCatching {
            if (prompt.contains('\n')) {
                target.session.paste(prompt)
                target.session.write("\r")
            } else {
                target.session.write("$prompt\r")
            }
        }.onSuccess {
            store.recordWidgetPromptQueued(prompt)
            ScouterWidgetProvider.updateAll(this, force = true)
            Toast.makeText(this, R.string.scouter_widget_prompt_sent, Toast.LENGTH_SHORT).show()
        }.onFailure { error ->
            store.recordWidgetPromptFailed(error.message ?: error.javaClass.simpleName)
            ScouterWidgetProvider.updateAll(this, force = true)
            Toast.makeText(this, R.string.scouter_widget_prompt_no_codex, Toast.LENGTH_SHORT).show()
        }
    }

    private fun findBoundReadyCodexTerminal(store: ScouterStateStore): WidgetCodexTarget {
        val binding = store.widgetCodexBinding() ?: return WidgetCodexTarget.Missing
        if (isBoundCodexBusy(store, binding)) return WidgetCodexTarget.Busy
        val ptySessionId = binding.ptySessionId ?: return WidgetCodexTarget.Missing
        val session = TerminalSessionService.sessionRegistry[ptySessionId] ?: return WidgetCodexTarget.Missing
        if (!session.isAlive()) return WidgetCodexTarget.Stale
        return if (isReadyCodexScreen(session.getScreenText())) {
            WidgetCodexTarget.Ready(session)
        } else {
            WidgetCodexTarget.Stale
        }
    }

    private fun isBoundCodexBusy(store: ScouterStateStore, binding: ScouterWidgetCodexBinding): Boolean {
        val codexSessionId = normalizeCodexSessionId(binding.codexSessionId) ?: return false
        val snapshot = store.all().firstOrNull { snapshot ->
            snapshot.source == ScouterSource.CODEX &&
                normalizeCodexSessionId(snapshot.sessionId) == codexSessionId
        } ?: return false
        return snapshot.currentStatus in BUSY_STATUSES
    }

    private fun normalizeCodexSessionId(sessionId: String?): String? {
        val trimmed = sessionId?.trim().orEmpty()
        if (trimmed.isBlank()) return null
        return UUID_SUFFIX_RE.find(trimmed)?.groupValues?.getOrNull(1) ?: trimmed
    }

    private fun isReadyCodexScreen(screenText: String): Boolean {
        if (screenText.isBlank()) return false
        val tail = screenText
            .lines()
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .takeLast(8)
        if (tail.isEmpty()) return false
        val hasCodexHeader = screenText.contains("OpenAI Codex") || tail.any { it.contains("codex", ignoreCase = true) }
        val hasCodexPromptStatus = tail.any { line ->
            CODEX_STATUS_RE.containsMatchIn(line) ||
                (line.contains(" default ") && line.contains("·") && line.contains("/"))
        }
        return hasCodexHeader && hasCodexPromptStatus
    }

    companion object {
        private val CODEX_STATUS_RE = Regex("""^gpt-[A-Za-z0-9_.-]+\s+default\s+·""")
        private val UUID_SUFFIX_RE = Regex("""([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$""")
        private val BUSY_STATUSES = setOf(
            ScouterStatus.THINKING,
            ScouterStatus.TOOL_RUNNING,
            ScouterStatus.WAITING_PERMISSION,
            ScouterStatus.ERROR
        )
    }
}

private sealed class WidgetCodexTarget {
    data class Ready(val session: ShellyTerminalSession) : WidgetCodexTarget()
    object Missing : WidgetCodexTarget()
    object Stale : WidgetCodexTarget()
    object Busy : WidgetCodexTarget()
}

private fun WidgetCodexTarget.messageResId(): Int = when (this) {
    is WidgetCodexTarget.Ready -> R.string.scouter_widget_prompt_sent
    WidgetCodexTarget.Missing -> R.string.scouter_widget_prompt_no_codex
    WidgetCodexTarget.Stale -> R.string.scouter_widget_prompt_stale_codex
    WidgetCodexTarget.Busy -> R.string.scouter_widget_prompt_busy
}
