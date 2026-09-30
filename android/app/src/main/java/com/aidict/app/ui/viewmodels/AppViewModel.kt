package com.aidict.app.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aidict.app.data.AppDatabase
import com.aidict.app.data.entities.Profile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

data class AppState(
    val activeProfile: Profile? = null,
    val profiles: List<Profile> = emptyList(),
    val unseenHistoryItems: Int = 0 // For the red dot
)

class AppViewModel(private val database: AppDatabase) : ViewModel() {
    private val _uiState = MutableStateFlow(AppState())
    val uiState: StateFlow<AppState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val savedProfileId = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                database.appDao().getSetting("ACTIVE_PROFILE_ID")?.value?.toIntOrNull()
            }
            
            database.appDao().getProfiles().collectLatest { profileList ->
                var list = profileList
                if (list.isEmpty()) {
                    val defaultProfile = Profile(name = "Default", isDefault = true, rank = 0)
                    val id = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { database.appDao().insertProfile(defaultProfile).toInt() }
                    list = listOf(defaultProfile.copy(id = id))
                }
                
                val active = _uiState.value.activeProfile ?: list.find { it.id == savedProfileId } ?: list.firstOrNull { it.isDefault } ?: list.firstOrNull()
                _uiState.value = _uiState.value.copy(
                    profiles = list,
                    activeProfile = active
                )
            }
        }
    }

    fun setActiveProfile(profile: Profile) {
        _uiState.value = _uiState.value.copy(activeProfile = profile)
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            database.appDao().insertSetting(com.aidict.app.data.entities.AppSetting("ACTIVE_PROFILE_ID", profile.id.toString()))
        }
    }

    fun markHistoryUnseen() {
        _uiState.value = _uiState.value.copy(unseenHistoryItems = _uiState.value.unseenHistoryItems + 1)
    }

    fun clearHistoryUnseen() {
        _uiState.value = _uiState.value.copy(unseenHistoryItems = 0)
    }
}
